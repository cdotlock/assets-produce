# Local VideoCtl Tool Reference

`videoctl` is the opencode-local video prompt workflow tool.

Use it instead of Bash or old `scripts/bin/videoctl` commands when operating inside opencode.

## Tool Operations

| Operation | Purpose | Live media? |
|---|---|---|
| `payload` | Parse a `prompt.md` and build the gateway request JSON locally | no |
| `validate` | Check media URLs and sidecar URL resolution | no |
| `submit_dry_run` | Write `request.json` and `state.json` into a local run directory | no |
| `status` | Read a local run directory state | no |
| `prompt_review` | Score one prompt against the local checklist | no |
| `prompt_compare` | Compare a candidate prompt with a reference prompt | no |

## Boundary

This tool intentionally does not expose live submit. Live video generation remains a separate explicitly approved path.

Do not use Bash for:

- payload construction
- prompt validation
- dry-run submit
- run-state inspection
- prompt review
- prompt comparison

Do not use this tool to bypass prompt-only boundaries. It is safe for prompt-only and dry-run verification.

## Typical Sequence

1. Write or revise `video-prompt.md`.
2. Call `videoctl` with `operation=prompt_review`.
3. Call `videoctl` with `operation=payload` if media references are ready.
4. Call `videoctl` with `operation=validate` only when checking real or sidecar URLs is needed.
5. Call `videoctl` with `operation=submit_dry_run` to materialize the local request/state.
6. Call `videoctl` with `operation=status` to inspect the dry-run directory.
