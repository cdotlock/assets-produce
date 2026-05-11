# Nine-Section Video Prompt Template

Use this empty structure. Do not copy historical answer prompts.

```yaml
---
shot_id: shot_1
duration: 12s
mode: prompt-only
scene: ""
shot_function: |
  ""
prev_shot_recap: |
  ""
next_shot_setup: |
  ""
emotion_arc: ""
assets:
  images: []
  videos: []
---
```

## ① 版权 + 风格声明

Declare original characters, non-real-person status, cel-shaded flat anime illustration, Korean webtoon style, 9:16 vertical, and no subtitles.

## ② 人物唯一性铁律

One visible instance per named character. Forbid duplicate bodies, cloned faces, split positions, or identity swaps.

## ③ @图N 说明 + 空间关系

List every reference image in exact `assets.images` order and state what each image controls: space, time/pose continuity, or character identity.
Describe layout, camera side/axis, foreground/midground/background, and character facing direction.

## ④ 核心叙事总纲

State the story beat of this shot, what changes emotionally or physically, and what must not be resolved yet.

## ⑤ 关键场景时间轴（故事线）

Use second ranges such as `0-3s`, `3-6s`, and `10-12s`.
Each range should contain one dominant beat.

## ⑥ 关键场景分镜

Describe camera, action, blocking, gaze, and final locked state.
Prefer stable physical motion and avoid multiple difficult distance changes in one shot.

## ⑦ 音效层

Keep sound sparse. Use dialogue, environment, and one restrained musical layer.
For major revelations, prefer silence or a single environmental source over dramatic scoring.

## ⑧ 禁止事项

List only the highest-risk prohibitions: wrong characters, wrong scene, wrong plot beat, duplicate characters, reference-order mismatch, subtitles/text, realism/3D/photo look, and media-policy risks.

## ⑨ 素材上传清单

For prompt-only runs, list intended reference roles and local/source paths.
For live runs later, URLs must be uploaded and validated before submission.
