# Novel To Video Prompt-Only Skill Draft

Use this draft when rebuilding the Langfuse `skill_novel-to-video` body. Until the user asks to upload, this file is local source material only.

## Goal

Turn novel/script context into production-grade prompt artifacts:

- image prompt specs
- video prompt markdown
- legacy-compatible video prompt JSON
- self-review
- trace summary
- manifest

Default mode is prompt-only.

## Hard Boundary

In prompt-only mode:

- do not generate images
- do not generate videos
- do not upload, submit, download, extract frames, crop, concatenate, or validate live URLs
- do not call `curl`, ad hoc HTTP, or direct media gateway scripts
- do not read historical answer prompts, ablation outputs, archived generated prompts, or authority prompt examples

Live media execution is a separate explicit user-authorized phase.

## Local Tool Boundary

Inside opencode, use the local `videoctl` tool for video prompt workflow operations instead of Bash:

- `payload`: build gateway request JSON locally
- `validate`: check media URLs and sidecar resolution
- `submit_dry_run`: write local `request.json` and `state.json`
- `status`: inspect local run state
- `prompt_review`: score one prompt
- `prompt_compare`: compare two prompts

The `videoctl` tool is prompt-only/dry-run safe. It intentionally does not expose live video submit.

## Workflow

1. Read the full script and case/brief before writing.
2. Derive `shot_function`, `prev_shot_recap`, `next_shot_setup`, and `emotion_arc`.
3. Identify physically present characters and excluded characters.
4. Build image prompt specs using the Agent-Forge style presets:
   - portrait: Korean webtoon/anime full-body, 9:16, white background, no text
   - scene: 16:9 or panorama empty scene, anime/Shinkai natural light, clear color, no people, no text
   - costume/update: preserve identity, change only outfit/accessory description
   - shot anchor: camera, layout, character placement, mood, and continuity
5. Build video prompt markdown with YAML frontmatter and the nine sections:
   - 版权 + 风格声明
   - 人物唯一性铁律
   - @图N 说明 + 空间关系
   - 核心叙事总纲
   - 关键场景时间轴（故事线）
   - 关键场景分镜
   - 音效层
   - 禁止事项
   - 素材上传清单
6. Self-review once, then revise only concrete failures.
7. For local verification, call the `videoctl` tool for prompt review, payload, validation, dry-run submit, status, or comparison. Do not shell out to old `scripts/bin/videoctl`.

## Video Prompt Rules

- `assets.images` order must exactly match `@图N` order.
- The prompt must state what each reference controls: space, time/pose continuity, or character identity.
- Do not enumerate clothing, accessories, hairstyle, or facial details when a reference image exists.
- Use `@图N` reference binding plus minimal age/gender/body-state text.
- Use stable physical actions and clear screen zones.
- End important shots with camera still, characters still, and composition locked.
- Keep the performance layer dominant; trim long prohibition lists before trimming action/emotion/timeline.

## Seedance Rules

- Strong physical actions are reliable; micro-expressions are weak.
- Use at most 1-2 weak actions in a shot, and pair them with strong physical actions.
- Emotion strength often renders weaker than written; calibrate emotional micro-actions 1.5-2x stronger.
- Read next-shot context before deciding whether this shot is a fuse, reveal, explosion, aftermath, or choice setup.
- Four reference images is the normal upper bound.
- For L3/L4 continuity, `_end` and `_spatial` frames have different jobs. If no actual frames exist, write a shot anchor prompt instead of inventing URLs.

## Director Rules

- Use shot size to carry emotion: wide/medium-wide for power map, medium-close for conflict, close-up only for decisive moments.
- For 3+ characters, stage with foreground/midground/background depth.
- Entrances need an explicit path, obstacle avoidance, and final position.
- Major revelations should reduce sound rather than add dramatic music.
- L4 action chains should be split conceptually and kept to four or fewer major actions per prompt.

## Output Contract

When asked to produce prompt artifacts, write:

- `image-prompts.json`
- `video-prompt.md`
- `legacy-video-prompt.json`
- `self-review.json`
- `trace-summary.json`
- `manifest.json`

The final assistant response should be compact and should not include the full prompt if files were requested.
