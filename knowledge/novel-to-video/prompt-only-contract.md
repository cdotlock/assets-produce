# Prompt-Only Contract

Prompt-only is the default local mode for AB tests and prompt authoring.

## Boundary

Do:

- read the case file, full script, asset inventory, style presets, and active local rules
- produce image prompt specs, video prompt markdown, legacy-compatible JSON, self-review, trace summary, and manifest
- keep the workflow agent-native: reason from local files and atomic prompt artifacts
- use the external `videoctl/bin/videoctl` CLI for payload construction and dry-run state inspection when verification is needed

Do not:

- load Langfuse or managed skills
- generate images or videos
- upload, submit, download, extract frames, crop, concatenate, or validate live URLs
- read historical answers, ablation outputs, archived generated prompts, or authority prompt examples
- call `curl`, ad hoc HTTP scripts, live `videoctl submit/upload/download/extract/run-shot`, or media-generation tools

## Required Context

Read these local inputs before writing:

- `README.md`
- `case.json`
- `rules/prompt-only-contract.md`
- `rules/video-prompt-standard.md`
- `references/nine-section-template.md`
- `references/character-reference-policy.md`
- `references/seedance-core-lessons.md`
- `references/director-playbook-core.md`
- `references/shot-id-policy.md`
- `references/videoctl-tool-reference.md`
- `style/image-style-presets.json`
- `inventory/assets.json`
- the full script JSON for the requested episode

## Reasoning Steps

1. Derive `shot_function`, `prev_shot_recap`, `next_shot_setup`, and `emotion_arc` from full script context.
2. Identify physically present characters and explicitly excluded characters.
3. Select image prompt types: scene, portrait, costume/update, and shot anchor as needed.
4. Bind video references by order: `assets.images[0]` is `@图1`, `assets.images[1]` is `@图2`, and so on.
5. Write the nine-section video prompt with YAML frontmatter.
6. Self-review once against expected characters, expected phrases, scene, forbidden content, media boundary, and image/video consistency.

Keep the run compact: after all required files are read, write the six artifacts directly. Avoid repeated analysis passes or re-reading files unless a concrete contradiction is found.
