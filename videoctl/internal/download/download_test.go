package download

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDownloadWritesVideoAndSidecar(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("video"))
	}))
	defer server.Close()

	out := filepath.Join(t.TempDir(), "shot.mp4")
	videoPath, sidecar, err := Download(context.Background(), server.URL+"/video.mp4", out, Options{Timeout: 2 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(videoPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "video" {
		t.Fatalf("unexpected video content %q", raw)
	}
	sidecarRaw, err := os.ReadFile(sidecar)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(sidecarRaw)) != server.URL+"/video.mp4" {
		t.Fatalf("unexpected sidecar %q", sidecarRaw)
	}
}
