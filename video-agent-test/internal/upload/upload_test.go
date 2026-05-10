package upload

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"video-agent-claude-wangbo/internal/config"
)

func TestUploadFilesWritesSidecar(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected auth header %q", got)
		}
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			t.Fatal(err)
		}
		if folder := r.FormValue("folder"); folder != "public/image" {
			t.Fatalf("unexpected folder %q", folder)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"url":"https://bucket.oss-cn-shanghai.aliyuncs.com/source.png"}}`))
	}))
	defer server.Close()

	dir := t.TempDir()
	path := filepath.Join(dir, "source.png")
	if err := os.WriteFile(path, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}

	results := UploadFiles(context.Background(), []string{path}, Options{
		Config: &config.Config{
			APIBase:    server.URL,
			APIKey:     "test-key",
			UploadPath: "/upload",
		},
		Timeout: 2 * time.Second,
	})
	if len(results) != 1 || !results[0].OK {
		t.Fatalf("unexpected results %#v", results)
	}
	raw, err := os.ReadFile(path + ".url")
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(raw)) != "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png" {
		t.Fatalf("unexpected sidecar %s", raw)
	}
}
