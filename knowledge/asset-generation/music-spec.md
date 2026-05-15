# music-spec

Skill body for `intent.kind == "music"` — a **background music
track** generated from a text brief. Used (eventually) for episode
score / mood beds in short videos and comic motion sequences.

> ## STATUS — DETERMINISTIC PLACEHOLDER (read this first)
>
> This skill is a **deliberate, deterministic placeholder**, not an
> incomplete or broken feature. **Suno has no official first-party
> public API** — every public "Suno API" is a reverse-engineered
> third-party gateway with its own auth / endpoint / async contract.
> Per **master spec §15 row 1.13**, selecting and wiring a real Suno
> gateway is a **deferred open item** (a governance-approved decision,
> not an oversight).
>
> The backing atomic tool
> [`generate-music-suno`](../../agent/packages/opencode/src/tool/asset/generate-music-suno.ts)
> therefore performs **no HTTP and no OSS upload**, returns **no audio
> URL**, and emits a fixed placeholder string with
> `metadata.placeholder: true`. Same input → byte-identical output.
> When a gateway is later chosen, a new §15 revision wires the real
> HTTP + OSS path into the tool and this body is rewritten to describe
> it. Until then, treat a music intent as **not produced — surface
> upstream as deferred**, never as a hard failure.

## Intent

You are (eventually) producing **one background music track** from a
brief — a genre/mood-driven bed for a scene or episode. **Currently**
this is the placeholder described in the STATUS notice above: the input
contract below is documented so it is ready for the future real wiring,
but no real track is generated today.

If the brief is really asking for a discrete sound effect, foley hit,
spoken line, or an on-screen visual event, this is the wrong skill —
see Boundary.

## Atomic tools (allowed)

- **`generate-music-suno` — placeholder; the only tool.** It calls
  nothing (no Suno gateway is selected — spec §15 row 1.13), uploads
  nothing, and deterministically returns a fixed placeholder message
  with `metadata.placeholder: true`. Input: `prompt` (required),
  optional `duration_seconds` (≤ 300), `style`, `instrumental`,
  `dryRun` (accepted for structural parity only — there is no upstream
  to skip, so it behaves identically to the default path).

There is no fallback tool, and **no real music path exists yet**. Do
not substitute `generate-sfx-elevenlabs` (that is foley, not music — see
Boundary), and do not invent audio bytes or a fabricated URL to "fill
in" for the missing gateway.

## Inputs

The real input contract is documented now so the intent→params mapping
is ready the moment a gateway is wired. **Today these inputs are echoed
back in `metadata` only** — they do not drive any generation.

- `intent.spec_md` → `prompt`. Describe the track: mood, energy,
  instrumentation, tempo feel, intended scene function. Schema requires
  1–1000 chars.
- `intent.constraints.duration_sec` → `duration_seconds`. The schema
  hard-caps this at **300s (5 min)**; music beds run longer than SFX.
  Omit to let the (future) model auto-pick a natural length.
- style hint ("lo-fi", "epic orchestral", "tense ambient") → `style`
  (free-form genre/style string).
- vocal-free requirement → `instrumental: true`.
- `dryRun` → accepted for parity only; behaves identically to default.

Example `intent.spec_md`:

```
music: low, tense underscore for a hilltop confrontation at night
mood: foreboding, restrained, slow build, no release
instrumentation: sparse low strings, distant percussion pulses
function: sits under dialogue — must not crowd the mids
duration: ~90s, instrumental
```

Resulting tool params (echoed into `metadata` today; will drive the
real call once a gateway is selected):

```json
{
  "prompt": "Low tense underscore for a nighttime hilltop confrontation; foreboding, restrained, slow build with no release; sparse low strings and distant percussion pulses; sits under dialogue.",
  "duration_seconds": 90,
  "style": "tense ambient",
  "instrumental": true
}
```

## Output shape

The tool **always** returns the same deterministic placeholder. Its
`output` is the exact constant string:

```
music generation pending Suno gateway selection — see spec §15 row 1.13 (no official Suno API; gateway deferred)
```

and `metadata` is
`{ truncated:false, placeholder:true, prompt, model:"suno-v4",
duration_seconds:<n|null>, style:<s|null>, instrumental:<b|null> }`.

There is **no `url`** — no audio is produced. The loop's terminal
outcome for a placeholder result must convey "**music asset not
produced — deferred per spec §15 row 1.13**", e.g.:

```json
{
  "ok": false,
  "atomic_tool": "generate-music-suno",
  "deferred": true,
  "reason": "music generation pending Suno gateway selection — see spec §15 row 1.13 (no official Suno API; gateway deferred)",
  "asset_type": "audio",
  "langfuse_trace_id": "<trace id>"
}
```

A `metadata.placeholder: true` result is **not** a hard failure and
**not** `metadata.error` — it is the expected deferred state. Surface
it upstream as deferred (so the caller knows music is intentionally
unavailable), not as `ATOMIC_TOOL_FAILED`.

## Failure handling

Because there is no upstream call, there is no upstream failure mode:

- The only non-success state is the **deferred-placeholder state
  itself** — `metadata.placeholder: true`, always, for every accepted
  input. Treat it as deferred, never as a hard error.
- **Schema rejection** — an empty / over 1000-char `prompt`, or
  `duration_seconds` > 300 — is rejected at the Schema boundary before
  `execute` runs. Fix the intent (trim/expand the prompt, clamp the
  duration); do not retry the malformed call.
- The tool's `Effect.catch` tail exists **only for structural parity**
  with the other asset tools (so its Effect channel matches the
  framework's `never`). The happy path cannot reach it — do not design
  the loop around a thrown music error; it will not occur.

## Boundary

- **Discrete sound effect / foley hit** (doorbell, footstep, UI ping)
  → [`sfx-spec`](sfx-spec.md). **That skill is the full real
  implementation** (`generate-sfx-elevenlabs` → real ElevenLabs call →
  inline OSS upload → permanent mp3 URL) — use it for non-musical
  isolated sounds.
- **Narration / dialogue / TTS / any spoken line** → out of scope. No
  voice/TTS atomic tool exists; surface as unsupported.
- **An on-screen visual event** (an effect you must *see*) → the
  relevant image/CG skill (`cg-render-spec` / `scene-bg-spec`), not
  this one.
- **When a real Suno gateway is later selected**, a new master spec
  §15 revision wires the real gateway HTTP + OSS upload into
  `generate-music-suno` and this body is rewritten to describe the real
  output shape. Until that revision lands, cite the deferred open item
  (spec §15 row 1.13) and treat music as intentionally unavailable.
