---
name: novel-to-video
description: Produce and verify novel-to-video prompt artifacts, using the local knowledge pack and the external videoctl CLI.
---

# Novel To Video

Use this skill when the user asks to create, review, validate, or generate
novel-to-video prompt/video assets in this repository.

## Sources

Read these local files before writing prompt artifacts:

- `knowledge/novel-to-video/prompt-only-contract.md`
- `knowledge/novel-to-video/video-prompt-standard.md`
- `knowledge/novel-to-video/character-reference-policy.md`
- `knowledge/novel-to-video/seedance-core-lessons.md`
- `knowledge/novel-to-video/director-playbook-core.md`
- `knowledge/novel-to-video/shot-id-policy.md`
- `knowledge/novel-to-video/nine-section-template.md`
- `knowledge/novel-to-video/videoctl-tool-reference.md`
- `knowledge/novel-to-video/image-style-presets.json`

## CLI

Build the CLI if needed:

```bash
test -x videoctl/bin/videoctl || make -C videoctl build
```

Use `videoctl/bin/videoctl` as the only video execution entrypoint:

```bash
videoctl/bin/videoctl payload <prompt.md>
videoctl/bin/videoctl validate <prompt.md> --timeout 300 --json
videoctl/bin/videoctl submit <prompt.md> --dry-run --run-dir <run_dir> --json
videoctl/bin/videoctl status <run_dir> --json
```

Run live `submit`, `upload`, `download`, or frame extraction only after explicit
user approval.

## Workflow

1. Read the full episode script, case brief, available assets, and knowledge pack.
2. Derive `shot_function`, `prev_shot_recap`, `next_shot_setup`, and `emotion_arc`.
3. Write image prompt specs and a nine-section `prompt.md` with YAML frontmatter.
4. Self-review once against character presence, scene, continuity, reference order, forbidden text, and no-subtitle/no-watermark rules.
5. Use `videoctl/bin/videoctl payload` or `submit --dry-run` for local payload/run-state checks.
6. Stop for user confirmation before any live media command.

Never hand-write direct gateway HTTP calls.
