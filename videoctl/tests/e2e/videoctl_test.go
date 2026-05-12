package e2e

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestVideoctlSubmitDryRunWritesRequest(t *testing.T) {
	repo := repoRoot(t)
	temp := t.TempDir()
	mediaPath := filepath.Join(temp, "source.png")
	if err := os.WriteFile(mediaPath+".url", []byte("https://bucket.oss-cn-shanghai.aliyuncs.com/source.png\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	promptPath := writePrompt(t, temp, mediaPath)
	runDir := filepath.Join(temp, "run")

	cmd := exec.Command("go", "run", "./cmd/videoctl", "submit", promptPath, "--dry-run", "--run-dir", runDir, "--json")
	cmd.Dir = repo
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("dry-run failed: %v\n%s", err, output)
	}

	if _, err := os.Stat(filepath.Join(runDir, "request.json")); err != nil {
		t.Fatal(err)
	}
	stateRaw, err := os.ReadFile(filepath.Join(runDir, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(stateRaw), `"status": "dry_run"`) {
		t.Fatalf("unexpected state: %s", stateRaw)
	}
}

func TestVideoctlSubmitWaitAgainstFakeGateway(t *testing.T) {
	var sawGenerate bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/media.png":
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Content-Length", "3")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("png"))
		case "/generate":
			sawGenerate = true
			if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
				t.Fatalf("unexpected auth header %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"data":{"url":"https://bucket.oss-cn-shanghai.aliyuncs.com/out.mp4"}}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	repo := repoRoot(t)
	temp := t.TempDir()
	promptPath := writePrompt(t, temp, server.URL+"/media.png")
	runDir := filepath.Join(temp, "run")

	cmd := exec.Command("go", "run", "./cmd/videoctl", "submit", promptPath, "--wait", "--timeout", "5", "--poll", "1", "--run-dir", runDir, "--allow-non-oss", "--json")
	cmd.Dir = repo
	cmd.Env = append(os.Environ(),
		"AGENT_API_BASE="+server.URL,
		"AGENT_API_KEY=test-key",
		"AGENT_VIDEO_GENERATE_PATH=/generate",
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("submit failed: %v\n%s", err, output)
	}
	if !sawGenerate {
		t.Fatal("fake gateway was not called")
	}

	videoURL, err := os.ReadFile(filepath.Join(runDir, "video.url"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(videoURL)) != "https://bucket.oss-cn-shanghai.aliyuncs.com/out.mp4" {
		t.Fatalf("unexpected video URL: %s", videoURL)
	}

	var state struct {
		Status string `json:"status"`
	}
	stateRaw, err := os.ReadFile(filepath.Join(runDir, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(stateRaw, &state); err != nil {
		t.Fatal(err)
	}
	if state.Status != "succeeded" {
		t.Fatalf("unexpected state: %s", stateRaw)
	}
}

func writePrompt(t *testing.T, dir string, imageRef string) string {
	t.Helper()
	promptPath := filepath.Join(dir, "prompt.md")
	err := os.WriteFile(promptPath, []byte(`---
duration: 12s
assets:
  images:
    - `+imageRef+`
  videos: []
---
Prompt body.
`), 0o644)
	if err != nil {
		t.Fatal(err)
	}
	return promptPath
}

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}
