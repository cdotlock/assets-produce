# Video Prompt Standard

## Character Appearance Rule

The final video prompt must not enumerate character clothing, accessories, hairstyle, facial details, or shoe/pants/shirt colors when a reference image exists.

Use reference binding instead:

```text
@图2 Sylvia（以 @图2 为唯一立绘参考：二十多岁女性，腹部微隆）
```

Allowed character text:

- age band: twenties, thirties, fifties
- gender
- special physical state: pregnancy, broad build, clear height/body difference
- non-visual presence: authority, steadiness, fear, exhaustion

Forbidden when a reference image exists:

- clothing item, material, cut, color
- jewelry/accessories
- hairstyle details
- facial feature details
- repeatedly restating outfit fields from the script

If a character has no reference image, use outline-level differences only:

```text
本镜新增人物 Huxley 以轮廓型差异区分（无立绘）：三十岁左右男性，体型宽壮明显高于其他人，气质沉稳。
```

## YAML Fields

Every video prompt needs:

- `shot_id`
- `duration`
- `mode`
- `scene`
- `shot_function`
- `prev_shot_recap`
- `next_shot_setup`
- `emotion_arc`
- `assets.images`
- `assets.videos`

## Body Sections

Use the nine sections in this exact order:

1. 版权 + 风格声明
2. 人物唯一性铁律
3. @图N 说明 + 空间关系
4. 核心叙事总纲
5. 关键场景时间轴（故事线）
6. 关键场景分镜
7. 音效层
8. 禁止事项
9. 素材上传清单

## Concurrency And Live Generation

Prompt-only runs never generate media.

For later live generation:

- same-episode sequential shots are not parallelized, because later shots need previous-shot continuity
- branch shots can run in parallel only after the parent choice shot is finished
- episode-level parallelism is allowed only when no continuity dependency exists
- live generation and any parallel execution need explicit user approval

## Final Review Checklist

- No character outfit/accessory/hairstyle enumeration in video prompt text.
- Every `@图N` reference matches the same order as `assets.images`.
- Expected scene, characters, phrases, and emotional arc are present.
- Forbidden characters, scenes, plot beats, subtitles, duplicate characters, and realism/3D/photo style are absent.
- Image prompts and video prompt describe the same characters, scene, style, and continuity anchors.
