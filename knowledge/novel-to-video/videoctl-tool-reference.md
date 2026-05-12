# videoctl CLI Reference

`videoctl` is the external video workflow CLI. It is not an opencode built-in
tool and there is no MCP layer for this workflow.

Build it from the repository root:

```bash
bun run videoctl:build
videoctl/bin/videoctl help
```

## Prompt-Only Commands

Use these commands while authoring or checking prompt artifacts:

```bash
videoctl/bin/videoctl payload <prompt.md>
videoctl/bin/videoctl validate <prompt.md> --timeout 300 --json
videoctl/bin/videoctl submit <prompt.md> --dry-run --run-dir <run_dir> --json
videoctl/bin/videoctl status <run_dir> --json
```

`payload` and `submit --dry-run` do not call image or video generation services.
`validate` performs live URL checks, so use it only when the task explicitly
requires checking media URLs.

## Live Commands

Only run these after explicit user approval to generate or post-process media:

```bash
videoctl/bin/videoctl upload <file...>
videoctl/bin/videoctl submit <prompt.md> --wait
videoctl/bin/videoctl download <video_url> --out <shot.mp4>
videoctl/bin/videoctl extract-end-frame <shot.mp4> <shot_end.png>
videoctl/bin/videoctl extract-candidates <shot.mp4> <out_dir> --shot-id <shot_id>
videoctl/bin/videoctl select-spatial-frame <candidate.png> <shot_spatial.png>
videoctl/bin/videoctl run-shot <prompt.md> --download --extract-end-frame
```

Do not hand-write `curl` or ad hoc HTTP clients for video generation. The CLI
owns API paths, run directories, polling, error files, and sidecar behavior.

## Run Directory Contract

`submit` writes a run directory under the prompt's shot directory unless
`--run-dir` is provided. Common files:

| File | Meaning |
|---|---|
| `request.json` | Exact payload built from `prompt.md` |
| `submit-response.json` | Raw gateway submit response |
| `poll.jsonl` | Polling history |
| `result.json` | Terminal success payload |
| `video.url` | Final video URL |
| `error.json` | Terminal failure payload |
| `state.json` | Local status read by `status` |

Report concrete command outputs and paths. Do not infer success without reading
the run state or `video.url`.
