# Character Reference Policy

## Authority

The authoritative outfit/source data is the current episode script:

```text
works/{novel_id}/scripts/ep_{N}.json::character_outfits
```

Use those fields to select and verify the correct portrait/costume image. Do not copy full outfit text into the final video prompt.

## Stable Identity Rules

Lock only truly stable visual identity through reference images:

- costume/overall outfit
- hair and body shape
- pregnancy state
- unique accessory when already visible in the reference

Do not lock:

- light temperature, focal length, camera model, or color grading
- signature actions
- forbidden actions
- trauma tells before their story activation point

## Known Silver Moon Manor Mapping

| Character + scene type | Reference path |
|---|---|
| Sylvia · everyday/living room | `works/silver-moon-manor/assets/costume_sylvia.png` |
| Sylvia · cemetery/outdoor | `works/silver-moon-manor/assets/Sylvia人物立绘.png` |
| James | `works/silver-moon-manor/assets/char_james_portrait.png` |
| Kennedy | `works/silver-moon-manor/assets/costume_kennedy.png` |
| Daisy | `works/silver-moon-manor/assets/costume_daisy.png` |
| Luna Miller | `works/silver-moon-manor/assets/costume_luna_miller.png` |
| Huxley | `works/silver-moon-manor/assets/char_huxley_portrait.png` |

## Cross-Shot Consistency

Reference images are stronger than prose. Use:

1. scene panorama or spatial frame for structure/material/light
2. previous end frame for pose and temporal continuity
3. character portrait/costume images for identity

Keep total reference images lean. Four images is the usual upper bound for prompt stability; more images can dilute the text performance layer.
