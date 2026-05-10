package validate

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestValidateFallsBackFromHeadToGet(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Content-Length", "3")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("png"))
	}))
	defer server.Close()

	root := t.TempDir()
	promptPath := filepath.Join(root, "prompt.md")
	err := os.WriteFile(promptPath, []byte(`---
assets:
  images:
    - `+server.URL+`/image.png
---
Prompt body.
`), 0o644)
	if err != nil {
		t.Fatal(err)
	}

	ok, results := Validate(promptPath, Options{
		ProjectRoot: root,
		Timeout:     2 * time.Second,
		AllowNonOSS: true,
	})
	if !ok {
		t.Fatalf("expected ok, got results %#v", results)
	}
	if len(results) != 1 || results[0].ContentType != "image/png" {
		t.Fatalf("unexpected results %#v", results)
	}
}

func TestValidateRejectsZeroLength(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Content-Length", "0")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	root := t.TempDir()
	promptPath := filepath.Join(root, "prompt.md")
	err := os.WriteFile(promptPath, []byte(`---
assets:
  images:
    - `+server.URL+`/empty.png
---
Prompt body.
`), 0o644)
	if err != nil {
		t.Fatal(err)
	}

	ok, results := Validate(promptPath, Options{
		ProjectRoot: root,
		Timeout:     2 * time.Second,
		AllowNonOSS: true,
	})
	if ok {
		t.Fatalf("expected failure, got results %#v", results)
	}
	if results[0].Error != "Content-Length 为 0" {
		t.Fatalf("unexpected error: %s", results[0].Error)
	}
}
