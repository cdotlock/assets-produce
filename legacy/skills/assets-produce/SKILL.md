---
name: assets-produce
description: Produce image and video assets (backgrounds, character portraits/立绘, storyboard shots, animated videos) through the Agent Forge service at http://localhost:8001. Use whenever another agent needs to generate, regenerate, or version visual assets from text prompts — including character design, scene backgrounds, illustration, and image-to-video animation. Pick the right interaction surface (conversational agent, direct FC endpoint, or MCP tool) based on what the caller actually needs.
---

# assets-produce

You are another agent. You have reached this skill because you need to produce **images** (backgrounds, character portraits/立绘, storyboards) or **videos** (image-to-video animation) and hand back permanent OSS URLs.

The thing you are talking to — Agent Forge, running locally at `http://localhost:8001` — is **itself an agent** with its own tools, memory, skills, and persistence. You get to choose how much of that agent to engage with.

## Prerequisites (check once, skip if already up)

1. Service is running: `curl -sf http://localhost:8001/` returns 200. If not: `cd /Users/Clock/moonshort/assets-produce && pnpm dev`.
2. `.env` has `FC_GENERATE_IMAGE_URL/TOKEN`, `FC_GENERATE_VIDEO_URL/TOKEN`, `OSS_*`, `LLM_API_KEY`, `DATABASE_URL`.
3. PostgreSQL is reachable (local or docker — `docker compose -f docker-compose.dev.yml up -d` if not).

## Pick your surface

You are not meant to use all three. Pick one based on what you actually need.

| You need…                                                                 | Surface                          | Why                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A finished asset from a fuzzy brief ("make me a cyberpunk alley bg")      | **A. Agent chat**                | Forge agent reasons, chooses tools, retries, and returns URLs in a conversational reply. You describe, it decides. |
| One specific image or video, single call, no persistence, lowest latency  | **B. Direct FC endpoint**        | Skips Forge entirely. Goes straight to the GPU function. One request → one OSS URL.                                |
| Exact control over a typed tool (batch gen, versioned key, category tag)  | **C. MCP tool** (`video_mgr.*`)  | You already know which tool, you want persistence + version history + UI visibility.                               |

Default to **A** unless you have a reason. Use **B** when you just want raw pixels and don't need anything else. Use **C** when another UI or workflow depends on the result being persisted under a stable `key`.

---

## A. Talk to the Forge agent (natural language, recommended)

Forge runs its own agent loop with access to FC image/video, OSS, domain DB, etc. You send natural language. It picks tools, calls FC, uploads to OSS, and replies with URLs.

### Sync (blocks until agent finishes)

`POST http://localhost:8001/api/chat`

```json
{
  "message": "Generate a character portrait for Alice: teenage girl, blue dress, standing under cherry blossoms, anime style, full-body, transparent background. Tag it under 角色立绘.",
  "session_id": null
}
```

Response:
```json
{ "session_id": "sess_xxx", "reply": "Done. Portrait URL: https://mobai-file.oss-cn-shanghai.aliyuncs.com/..." }
```

- Pass the returned `session_id` on follow-ups to continue the same conversation (so "regenerate with a red dress" works).
- Be explicit about what you want in the reply ("respond with only the final URL", "return JSON: {url, key}") — Forge agent is chatty by default.

### Async (streaming, for long generations like video)

Submit and get a task handle:
```bash
curl -X POST http://localhost:8001/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"message":"Animate this portrait URL with gentle wind blowing through hair: <imageUrl>. Return the final mp4 URL.","user":"caller-id"}'
# → {"task_id":"task_xxx","session_id":"sess_xxx"}
```

Then stream events:
```bash
curl -N http://localhost:8001/api/tasks/task_xxx/events
```

SSE events you care about:
- `event: delta` → assistant token chunks (usually just log for debugging)
- `event: tool` → each tool call summary (proves progress, not final output)
- `event: done` → `{session_id, reply}` — the reply contains the URLs
- `event: error` → `{error}` — task failed; stop reading

Or poll: `GET /api/tasks/task_xxx` → `{status: "running|completed|failed", reply}`.

### When to prefer A

You don't know the exact tool sequence. You want retries, reference-image composition, or batching decided for you. You want results persisted under nice names in Forge's DB for the video UI to pick up.

---

## B. Direct FC endpoint (one-shot, no agent, no persistence)

When you have exactly one image or video to generate, don't want any Forge memory/DB side effects, and want the lowest latency. You're calling the GPU function directly; Forge is just the place where the URLs and tokens live.

### B-1. Image — text-to-image (+ optional reference images)

```bash
curl -X POST "$FC_GENERATE_IMAGE_URL" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $FC_GENERATE_IMAGE_TOKEN" \
  -d '{
    "prompt": "a cyberpunk alleyway at dusk, neon signs, rain, cinematic, 16:9",
    "referenceImageUrls": []
  }'
# → { "result": "https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/xxx.png" }
```

- `referenceImageUrls` optional — any publicly-fetchable image URLs used as style/content anchors.
- On error: `{ "error": "..." }` with non-2xx status.

### B-2. Video — image-to-video, one-step (submit + poll + upload, all inside FC)

```bash
curl -X POST "$FC_GENERATE_VIDEO_URL" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "generate",
    "imageUrl": "https://.../portrait.png",
    "prompt": "gentle wind blowing through hair, leaves falling, slow zoom-in"
  }'
# → { "result": "https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/xxx.mp4" }
```

This is the **one-step path** — FC internally submits the i2v job, polls until `status=done`, downloads the mp4, and re-uploads to OSS. **Expect 1–5 minutes.** Use a long HTTP timeout (≥600s).

If you want submit/poll split (e.g. to checkpoint your own state machine), see `action: "CVSync2AsyncSubmitTask"` then `"CVSync2AsyncGetResult"` in `fc-functions/README.md`.

### Fetching the FC URL/token from another machine

If you don't have the envs directly, ask Forge for them: `curl http://localhost:8001/api/public/env-status` (read-only endpoint, returns which envs are configured — not their values). Then have the operator share the values out-of-band. Do **not** hardcode tokens in your skill/code.

---

## C. MCP tool surface (`video_mgr` via `mcp_manager__use`)

Choose C when you need the asset tracked under a stable `key` for version history, rollback, and visibility in the Forge video UI. Persistence goes to both `key_resources` (versioned) and `domain_resources` (UI grouping).

### Connection

Register Forge as an MCP server in your agent config:
```json
{ "mcpServers": { "assets-produce": { "url": "http://localhost:8001/mcp" } } }
```

`video_mgr` is **lazy-loaded** — reach it via `mcp_manager__use`:
```
mcp_manager__use({
  provider: "video_mgr",
  tool:     "generate_image" | "generate_video" | "resolve_key_resource",
  args:     { ... }
})
```

### C-1. `generate_image` — batched, versioned image generation

```json
{
  "items": [
    {
      "key":         "char_alice_portrait",
      "prompt":      "...",
      "referenceImageUrls": ["https://..."],
      "category":    "角色立绘",
      "scopeType":   "novel",
      "scopeId":     "standalone",
      "title":       "Alice"
    }
  ]
}
```

- `key` — stable semantic id; re-using it creates **version N+1** of the same resource (the UI shows history, allows rollback). Convention: `char_<name>_portrait`, `scene_<n>_bg`, `shot_<scene>_<n>`.
- `category` — free-form UI bucket (`角色立绘` / `场景` / `分镜`).
- `scopeType` + `scopeId` — `"novel"` + `novelId` for global assets, `"script"` + `scriptDbId` for per-episode. If you have no novel context, `"novel"` + `"standalone"` is a safe sentinel.
- Returns `[{status, key, keyResourceId, imageUrl, version}]`.

### C-2. `generate_video` — records a video prompt (does NOT render)

Stores `{key, prompt, sourceImageUrl}` as a pending video in `domain_resources`. The Forge UI renders it later when the user triggers it. **Do not use this if you actually want an mp4 now** — use path B-2 (direct FC) instead, optionally followed by a `key_resources` write if you need versioning.

### C-3. `resolve_key_resource`

Given one or more `keyResourceId`s, returns current-version URL / key / mediaType. Use when your workflow earlier got an id back and later needs the URL.

---

## Recipes

### "Make me a character portrait and remember it"
Path A (chat): `"Generate character portrait for Alice: <prompt>. Save under key char_alice_portrait in scope novel:nov_001 category 角色立绘."`
Path C (precise): call `video_mgr.generate_image` with the full item.

### "Give me the mp4 NOW, no persistence"
Path B-2 (direct FC video). One request, one URL.

### "Animate the portrait I just made and keep a version-tracked record"
Two-step:
1. Path B-2 to get mp4 URL.
2. Path A follow-up on the same session: `"Record this video URL <mp4Url> under key video_alice_wind in scope novel:nov_001 category 分镜视频, mark the source image as <portraitUrl>."` — Forge will call the right tool to persist.

### "I need 12 storyboard images, consistent style, minimal latency"
Path C: one `generate_image` call with `items: [...12]`. They execute concurrently.

---

## Troubleshooting

- **Timeout on `/api/chat`** — the agent is doing long work (e.g. video). Switch to async path (`/api/tasks` + SSE).
- **`MCP "video_mgr" is not available`** — `FC_GENERATE_IMAGE_URL/VIDEO_URL` not set in `.env`. Reload the server after editing env.
- **FC returns `error: "content violation"`** — prompt triggered safety filter. Rephrase and retry.
- **FC video 504 / hang** — the volcengine i2v job is still running; increase your client timeout to 600s+, or switch to the split `CVSync2AsyncSubmitTask` + poll flow so you control checkpointing.
- **First request after boot is slow (~5–10s)** — MCP init is lazy. Warm it with any cheap MCP call (`mcp_manager__list`) if latency matters.
