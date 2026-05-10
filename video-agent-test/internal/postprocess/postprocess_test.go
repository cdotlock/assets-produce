package postprocess

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSelectSpatialFrameCopiesCandidate(t *testing.T) {
	dir := t.TempDir()
	candidate := filepath.Join(dir, "candidate.png")
	output := filepath.Join(dir, "out", "shot_spatial.png")
	if err := os.WriteFile(candidate, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := SelectSpatialFrame(candidate, output); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "png" {
		t.Fatalf("unexpected output %q", raw)
	}
}

func TestExtractEndFrameUsesConfiguredFFmpeg(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell script fixture is unix-only")
	}
	dir := t.TempDir()
	ffmpeg := filepath.Join(dir, "ffmpeg")
	if err := os.WriteFile(ffmpeg, []byte("#!/bin/sh\nout=\"\"\nfor arg do out=\"$arg\"; done\nprintf png > \"$out\"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("FFMPEG", ffmpeg)
	video := filepath.Join(dir, "shot.mp4")
	output := filepath.Join(dir, "shot_end.png")
	if err := os.WriteFile(video, []byte("video"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := ExtractEndFrame(context.Background(), video, output, 0.1); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != "png" {
		t.Fatalf("unexpected output %q", raw)
	}
}
