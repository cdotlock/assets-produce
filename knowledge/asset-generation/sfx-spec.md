# sfx-spec

Skill body for `intent.kind == "sfx"` — a **single short sound
effect / foley clip**: one discrete, isolated, non-musical, non-vocal
sound (a doorbell, a sword unsheathe, footsteps on gravel, a UI ping)
synthesized from a text brief. Used for shot-level audio garnish in
short videos and comic motion panels.

Phase 11 wired this to the **real** atomic tool
[`generate-sfx-elevenlabs`](../../agent/packages/opencode/src/tool/asset/generate-sfx-elevenlabs.ts).
The tool calls ElevenLabs `POST /v1/sound-generation`, receives mp3
bytes (`mp3_44100_128`), uploads them to OSS **inline**, and returns a
permanent OSS `https` URL. This is a production path, not a placeholder
(contrast with [`music-spec`](music-spec.md), which is a deliberate
deferred placeholder).

## Intent

You are producing **one short sound effect / foley clip** that:

- Is a single, isolated, clean sound — no human voice, no speech, no
  music bed, no ambient layering beyond what the brief asks for.
- Is short by nature (a beat to a few seconds; hard cap 30s — see
  Inputs).
- Lands as a **permanent OSS `https` mp3 URL** the loop can attach to
  the asset directly. No post-step upload is needed.

If the brief is really asking for a music track, ambient score, spoken
line, or an on-screen visual event, this is the wrong skill — see
Boundary.

## Atomic tools (allowed)

- **`generate-sfx-elevenlabs` — primary, and the only real path.**
  Calls ElevenLabs sound-generation, then uploads the mp3 to OSS itself
  and returns the bare OSS `https` URL as `output`. **It uploads to OSS
  internally — the loop does NOT call `oss-put` afterward** (this is the
  opposite of `cg-render-spec`, where the caller owns the upload step).
  Input: `prompt` (required), optional `duration_seconds`,
  `prompt_influence`, `model`, `promptSuffix`, `dryRun`.

There is **no fallback tool** for SFX. If `generate-sfx-elevenlabs`
fails, surface the failure (see Failure handling) — do not substitute an
image/video tool or invent audio.

**Do not** call `generate-music-suno` here (that is the music skill's
placeholder), and do not call any image/video atomic tool — a sound
effect is audio output, not a still or clip.

## Inputs

Map `AssetIntent` fields onto the tool params:

- `intent.spec_md` → `prompt`. Describe the sound concretely: source
  object, action, material, intensity, acoustic space. Fold any style /
  intensity phrasing ("muffled", "metallic", "distant", "sharp")
  directly into the prompt text — there is no separate style field.
- `intent.constraints.duration_sec` → `duration_seconds`. The schema
  hard-caps this at **30s**; if the brief asks for longer, **clamp to
  30 and note the clamp** (a long bed is a music/ambient job, not SFX —
  consider Boundary). Omit `duration_seconds` to let the model auto-pick
  a natural length.
- `prompt_influence` (0..1, default 0.3) → set this **only** when the
  brief demands strict literal adherence to the description; leave it
  unset otherwise so the model keeps a natural sound.
- `model` → leave unset (default `eleven_text_to_sound_v2`) unless the
  brief explicitly pins a model.
- `promptSuffix` → leave unset so the default foley suffix ("No human
  voice, no music, no speech. Clean, isolated sound.") is appended; pass
  `""` only if the brief intentionally needs the prompt sent verbatim.
- `dryRun` → testing only; never set on a real generation.

Example `intent.spec_md`:

```
sound: a single old brass doorbell, pressed once
character: (none — pure foley)
qualities: warm, slightly muffled as if heard from inside a hallway,
           short decay, no reverb tail beyond the natural room
duration: ~2s
```

Resulting tool params:

```json
{
  "prompt": "A single old brass doorbell pressed once, warm and slightly muffled as if heard from inside a hallway, short natural decay.",
  "duration_seconds": 2
}
```

## Output shape

On success the tool's `output` is the **bare OSS `https` mp3 URL** and
`metadata` is `{ truncated:false, ossUrl, model, prompt }`. The loop's
terminal `GenerationOutcome` should be:

```json
{
  "ok": true,
  "atomic_tool": "generate-sfx-elevenlabs",
  "url": "<oss https url, mp3>",
  "ref_urls": [],
  "asset_type": "audio",
  "langfuse_trace_id": "<trace id>"
}
```

`url` is taken directly from the tool's `output` (or
`metadata.ossUrl` — they are identical). `asset_type` is `"audio"`
(not `image`/`video`). SFX intents carry no reference images, so
`ref_urls` is empty.

## Failure handling

The tool **never throws** — every failure is folded into the result
with `metadata.error: true` and the message in `output`. Map them onto
the standard loop vocabulary (same codes as `cg-render-spec`):

- **`ELEVENLABS_API_KEY` not configured** → `output` is
  `generate-sfx-elevenlabs error: ELEVENLABS_API_KEY is not configured
  (set it to enable this tool)`. This is a config error, not a transient
  failure: **do not retry**; surface it to the caller as an
  unrecoverable setup problem.
- **Content moderation (HTTP 422)** → `output` is
  `generate-sfx-elevenlabs error: [elevenlabs/422] <detail>`. Treat as
  **`GENERATION_REJECTED`**; do not retry the same prompt blindly —
  rephrase only if the brief is salvageable.
- **Upstream auth (401) / 5xx / network** → `output` is
  `generate-sfx-elevenlabs error: [elevenlabs/<status>] <detail>` (or a
  request-failed message). Treat 5xx / network as
  **`ATOMIC_TOOL_FAILED`**; do not blindly retry (ElevenLabs calls cost
  credits). A 401 is effectively a config/auth problem — surface, do not
  retry.
- **Silent synthesis** (200 with body < 256 bytes) → `output` is
  `generate-sfx-elevenlabs error: ElevenLabs returned <n> bytes (< 256);
  treating as a silent/failed synthesis`. Regenerate **once** with a
  more concrete, sound-specific prompt; if it recurs, fail as
  `ATOMIC_TOOL_FAILED`.
- **OSS upload failure** → `output` is `generate-sfx-elevenlabs error:
  generate-sfx-elevenlabs: OSS upload failed — <detail>`. Treat as
  **`ATOMIC_TOOL_FAILED`** (the synthesis was fine; the upload leg
  broke).
- **Schema rejection** — `duration_seconds` > 30, or an empty / over
  1000-char `prompt` — is rejected at the Schema boundary before
  `execute` runs. This is an intent construction bug: **fix the intent**
  (clamp duration, trim/expand the prompt), do not retry the same
  malformed call.

## Boundary

- **Background music / scoring / ambient bed** → [`music-spec`](music-spec.md)
  — note that one is currently a **deferred placeholder** (Suno has no
  official API, per spec §15 row 1.13); it returns a placeholder, not
  audio.
- **Narration / dialogue / TTS / any spoken line** → out of scope.
  There is no voice/TTS atomic tool; surface this as **unsupported**
  rather than forcing it through SFX (the default foley suffix
  explicitly suppresses voice anyway).
- **A "sound" that is really an on-screen visual event** (an explosion
  you must *see*, a glowing glyph) → the relevant image/CG skill
  (`cg-render-spec` / `scene-bg-spec`), not this one. This skill
  produces audio only.
- **A long continuous bed (> ~30s)** is music/ambient territory, not a
  foley clip — re-route to `music-spec` rather than clamping a 30s SFX.
