package payload

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestBuildResolvesSidecarsAndMapsGatewayFields(t *testing.T) {
	root := t.TempDir()
	writeSidecar(t, root, "assets/first.png", "https://bucket.oss-cn-shanghai.aliyuncs.com/first.png")
	writeSidecar(t, root, "assets/ref.png", "https://bucket.oss-cn-shanghai.aliyuncs.com/ref.png")
	writeSidecar(t, root, "assets/prev.mp4", "https://bucket.oss-cn-shanghai.aliyuncs.com/prev.mp4")

	promptPath := filepath.Join(root, "prompt.md")
	err := os.WriteFile(promptPath, []byte(`---
shot_id: shot_1
duration: 12s
ratio: 9:16
resolution: 720P
first_frame: assets/first.png
assets:
  images:
    - assets/ref.png
  videos:
    - assets/prev.mp4
previous_frame_url: https://bucket.oss-cn-shanghai.aliyuncs.com/ref.png
previous_video_url: https://bucket.oss-cn-shanghai.aliyuncs.com/prev.mp4
continuation_tail_seconds: 2s
---
Prompt body.
`), 0o644)
	if err != nil {
		t.Fatal(err)
	}

	got, err := Build(promptPath, Options{ProjectRoot: root})
	if err != nil {
		t.Fatal(err)
	}

	if got["sourceImageUrl"] != "https://bucket.oss-cn-shanghai.aliyuncs.com/first.png" {
		t.Fatalf("sourceImageUrl = %v", got["sourceImageUrl"])
	}
	if !reflect.DeepEqual(got["referenceImageUrls"], []string{"https://bucket.oss-cn-shanghai.aliyuncs.com/ref.png"}) {
		t.Fatalf("referenceImageUrls = %#v", got["referenceImageUrls"])
	}
	if !reflect.DeepEqual(got["sourceVideoUrls"], []string{"https://bucket.oss-cn-shanghai.aliyuncs.com/prev.mp4"}) {
		t.Fatalf("sourceVideoUrls = %#v", got["sourceVideoUrls"])
	}
	if got["duration"] != 12 {
		t.Fatalf("duration = %v", got["duration"])
	}
	if got["ratio"] != "9:16" {
		t.Fatalf("ratio = %v", got["ratio"])
	}
	if got["continuationTailSeconds"] != 2 {
		t.Fatalf("continuationTailSeconds = %v", got["continuationTailSeconds"])
	}
	if got["prompt"] != "Prompt body." {
		t.Fatalf("prompt = %q", got["prompt"])
	}
}

func TestBuildRejectsMissingSidecar(t *testing.T) {
	root := t.TempDir()
	promptPath := filepath.Join(root, "prompt.md")
	err := os.WriteFile(promptPath, []byte(`---
assets:
  images:
    - assets/missing.png
---
Prompt body.
`), 0o644)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := Build(promptPath, Options{ProjectRoot: root}); err == nil {
		t.Fatal("expected missing sidecar error")
	}
}

func writeSidecar(t *testing.T, root string, ref string, value string) {
	t.Helper()
	path := filepath.Join(root, ref)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".url", []byte(value+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}
