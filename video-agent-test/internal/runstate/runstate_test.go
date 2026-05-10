package runstate

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCreateRunDirDoesNotOverwriteDefaultRun(t *testing.T) {
	root := t.TempDir()
	promptPath := filepath.Join(root, "shots", "shot_1", "prompt.md")
	if err := os.MkdirAll(filepath.Dir(promptPath), 0o755); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 5, 3, 16, 0, 0, 0, time.UTC)

	first, err := CreateRunDir(promptPath, "", now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CreateRunDir(promptPath, "", now)
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Fatalf("expected unique run dirs, got %s", first)
	}
	if filepath.Base(second) != "20260503-160000-01" {
		t.Fatalf("unexpected second run dir: %s", second)
	}
}

func TestCreateRunDirRejectsNonEmptyRequestedDir(t *testing.T) {
	root := t.TempDir()
	requested := filepath.Join(root, "run")
	if err := os.MkdirAll(requested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(requested, "request.json"), []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := CreateRunDir(filepath.Join(root, "prompt.md"), requested, time.Now()); err == nil {
		t.Fatal("expected existing run dir error")
	}
}
