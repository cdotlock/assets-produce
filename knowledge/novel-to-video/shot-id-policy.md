# Shot ID And Reference Policy

## Shot IDs

Use:

- `shot_{n}` for mainline shots
- `shot_{n}a` / `shot_{n}b` when one narrative segment is split
- `shot_{n}-{m}` for choice branches
- `shot_{n}-{m}{letter}` for branch sub-shots
- `shot_{id}_v{N}` for prompt iterations kept for comparison

Do not use Chinese characters, spaces, skipped numbers, duplicate IDs, or mixed branch separators.

## Reference Order

`assets.images` order and `@图N` order must match exactly.

Example:

```yaml
assets:
  images:
    - https://.../scene_living_room_panorama.png # @图1
    - https://.../shot_2_end.png                 # @图2
    - https://.../costume_sylvia.png             # @图3
```

Prompt body:

```text
@图1 空间地图，仅取房间结构与材质。
@图2 时间承接，仅取上一镜末尾站位和姿态。
@图3 Sylvia 角色主参考。
```

Wrong order can make Seedance treat a scene map as a character or a portrait as a spatial frame.

## Prompt-Only Local Paths

Prompt-only artifacts may list local paths or inventory keys for traceability. They are not live payloads.

Live generation later requires upload to OSS and reachable URLs before submit.

## Continuity Assets

For later live sequential shots:

- `previous_frame_url` or `_end` frame handles static pose continuity
- `previous_video_url` handles motion continuity
- `_spatial` frame handles layout and facing direction

When those are unavailable during prompt-only work, describe the intended continuity in the prompt and in `trace-summary.json`; do not fabricate URLs.
