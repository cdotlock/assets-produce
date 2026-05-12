# videoctl CLI Design

`videoctl` is the Go CLI that owns the deterministic execution boundary for
video tasks. The agent still writes and reviews `prompt.md`; the CLI owns media
upload, URL validation, payload construction, gateway submission, run-state
artifacts, video download, and ffmpeg-backed frame extraction.

The old Python helper scripts have been removed. `cmd/videoctl` is the only
source entrypoint, and the compiled local binary is `bin/videoctl`.

Agents should read `cmd/videoctl/AGENT_REFERENCE.md` before using the CLI.

## Build

```bash
make build
bin/videoctl help
```

`bin/` is ignored by git. Rebuild locally whenever the CLI changes.

## Command Surface

### Upload

```bash
bin/videoctl upload <file...>
bin/videoctl upload <file...> --folder public/image
bin/videoctl upload <file...> --no-sidecar
bin/videoctl upload <file...> --json
```

Uploads local media to the internal OSS upload endpoint and writes sibling
`.url` sidecars by default.

### Payload

```bash
bin/videoctl payload <prompt.md>
bin/videoctl payload <prompt.md> --allow-non-oss
bin/videoctl payload <prompt.md> --allow-text-only
```

Builds the gateway JSON without calling the gateway.

Rules:

- parse YAML frontmatter and prompt body
- preserve intended `ratio` values like `9:16`
- resolve local media paths through sibling `.url` sidecars
- reject local paths without sidecars
- require OSS URLs by default
- require at least one image URL by default
- map first image to `sourceImageUrl`
- map remaining images to `referenceImageUrls`
- map videos to `sourceVideoUrls`
- include `continuationTailSeconds` only when frontmatter provides it

### Validate

```bash
bin/videoctl validate <prompt.md>
bin/videoctl validate <prompt.md> --timeout 300
bin/videoctl validate <prompt.md> --allow-non-oss
bin/videoctl validate <prompt.md> --allow-empty
bin/videoctl validate <prompt.md> --json
```

Validates all media references needed by `prompt.md`.

Rules:

- collect `first_frame`, `last_frame`, `previous_frame_url`, `assets.images`
- collect `previous_video_url`, `assets.videos`
- resolve local paths through `.url` sidecars
- require OSS URLs by default
- perform `HEAD`, then fallback to streamed `GET` when needed
- validate HTTP status, content type, and explicit zero `Content-Length`
- fail when no media references exist unless `--allow-empty` is set

### Submit

```bash
bin/videoctl submit <prompt.md> --dry-run
bin/videoctl submit <prompt.md> --dry-run --run-dir <dir>
bin/videoctl submit <prompt.md> --wait
bin/videoctl submit <prompt.md> --wait --timeout 1200 --poll 30
bin/videoctl submit <prompt.md> --force
bin/videoctl submit <prompt.md> --resume-latest
```

Submits one approved prompt to the internal gateway. `--dry-run` prints or
writes the request payload and never calls the gateway.

Default live execution order:

1. load configuration
2. build payload
3. create run directory
4. write `request.json`
5. validate URLs
6. submit `POST /api/external/video/generate`
7. write `submit-response.json`
8. wait/poll when `--wait` is set
9. write `result.json` and `video.url`, or `error.json`
10. write `state.json`

Timeout rule:

- poll interval defaults to 30 seconds
- wait timeout defaults to 1200 seconds
- do not treat generation as timed out before 1200 seconds

### Status

```bash
bin/videoctl status <run-dir>
bin/videoctl status <run-dir> --json
```

Reads local `state.json` from a run directory and reports state.

### Download

```bash
bin/videoctl download <video_url> --out <shot.mp4>
bin/videoctl download --url-file <video.url> --out <shot.mp4>
bin/videoctl download <video_url> --out <shot.mp4> --no-sidecar
```

Downloads a generated video and writes a sibling `.url` sidecar by default.

### Frame Extraction

```bash
bin/videoctl extract-end-frame <shot.mp4> <shot_end.png>
bin/videoctl extract-end-frame <shot.mp4> <shot_end.png> --offset 0.1
bin/videoctl extract-candidates <shot.mp4> <out_dir> --shot-id shot_1
bin/videoctl extract-candidates <shot.mp4> <out_dir> --shot-id shot_1 --interval 2
bin/videoctl select-spatial-frame <candidate.png> <shot_spatial.png>
```

Frame extraction calls `ffmpeg`. Set `FFMPEG=/path/to/ffmpeg` to override the
binary.

### Run Shot

```bash
bin/videoctl run-shot <prompt.md> --download --extract-end-frame
bin/videoctl run-shot <prompt.md> --force --download --extract-end-frame
```

High-level command for a single approved shot. It submits with `--wait`, then
optionally downloads the video and extracts the end frame.

## Run Directory Contract

Default run directory:

```text
<shot-dir>/runs/<YYYYMMDD-HHMMSS>/
```

For:

```text
works/silver-moon-manor/episodes/ep_2/shots/shot_1/prompt.md
```

the default run directory is:

```text
works/silver-moon-manor/episodes/ep_2/shots/shot_1/runs/20260503-153000/
```

Artifacts:

```text
request.json
submit-response.json
poll.jsonl
result.json
video.url
error.json
state.json
```

Meanings:

- `request.json`: exact gateway payload
- `submit-response.json`: raw submit response
- `poll.jsonl`: one JSON object per poll attempt
- `result.json`: normalized terminal success result
- `video.url`: final generated video URL
- `error.json`: normalized terminal failure result
- `state.json`: local state for `status` and duplicate protection

## Duplicate Protection

Rules:

- If the latest run succeeded, `submit` refuses another live submission unless
  `--force` is set.
- If the latest run is non-terminal, `submit` refuses another live submission
  and asks for `--resume-latest` or `--force`.
- `--force` creates a new run directory.
- Run directories are never overwritten.

## Configuration

Required:

- `AGENT_API_KEY`

Optional:

- `AGENT_API_BASE`, default `https://agent.mob-ai.cn`
- `AGENT_UPLOAD_PATH`, default `/api/external/video/oss/upload`
- `AGENT_VIDEO_GENERATE_PATH`, default `/api/external/video/generate`
- `AGENT_VIDEO_STATUS_PATH`, optional status endpoint for async gateways

Environment variables override `.env`.

## Internal Packages

```text
cmd/videoctl/main.go
internal/cli/
internal/config/
internal/prompt/
internal/assets/
internal/payload/
internal/validate/
internal/gateway/
internal/runstate/
internal/upload/
internal/download/
internal/postprocess/
```

## Tests

Run:

```bash
make test
make build
bin/videoctl help
```

Covered behavior:

- prompt parsing
- duration and ratio handling
- sidecar resolution
- missing sidecar failures
- URL validation with mocked HTTP
- upload with mocked gateway
- download and sidecar writing
- run directory duplicate protection
- submit dry-run
- live submit against a fake gateway
- ffmpeg-backed commands using a fake `FFMPEG` binary

## Agent Usage Contract

When the skill is active, the agent should:

1. build the binary with `make build` if `bin/videoctl` is missing
2. upload local media with `bin/videoctl upload`
3. validate every approved prompt with `bin/videoctl validate`
4. submit with `bin/videoctl submit <prompt.md> --wait`
5. read `video.url` or `error.json` from the run directory
6. download and postprocess with `download`, `extract-end-frame`,
   `extract-candidates`, and `select-spatial-frame`

The agent should not call removed Python scripts and should not hand-write HTTP
requests to the internal video gateway.
