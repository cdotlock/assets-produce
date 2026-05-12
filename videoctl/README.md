# videoctl

Standalone video workflow CLI for novel-to-video production.

This package owns the execution boundary for upload, payload construction, URL
validation, dry-run/live submit, status, download, and frame extraction. It is
kept outside `agent/packages/opencode` so opencode can stay a generic agent
runtime.

## Build

```bash
make build
bin/videoctl help
```

From the repository root, the same binary is:

```bash
videoctl/bin/videoctl help
```

## Test

```bash
make test
```

## Common Commands

```bash
bin/videoctl payload <prompt.md>
bin/videoctl validate <prompt.md> --timeout 300
bin/videoctl submit <prompt.md> --dry-run --run-dir <run_dir> --json
bin/videoctl submit <prompt.md> --wait
bin/videoctl status <run_dir>
bin/videoctl download <video_url> --out <shot.mp4>
bin/videoctl extract-end-frame <shot.mp4> <shot_end.png>
bin/videoctl extract-candidates <shot.mp4> <out_dir> --shot-id <shot_id>
bin/videoctl select-spatial-frame <candidate.png> <shot_spatial.png>
```

Read [cmd/videoctl/AGENT_REFERENCE.md](cmd/videoctl/AGENT_REFERENCE.md) before
using the CLI from an agent session.
