# nrbi-render-prompt

Deterministic NRBI Phase-1 prompt assembler. Emits a **prompt, not an image**.

`render.py` `importlib`-loads the sha256-pinned frozen
`knowledge/style-prompts/source-of-record/render-with-style.py` and calls its
prompt-assembly builders **verbatim** (zero reimplementation). Byte-identity
to the NRBI demo is guaranteed by construction and locked by
`fixtures/{anchor_golden,layer_golden}.json` (regenerate: `python3
gen_fixtures.py`).

## Contract

Input JSON (stdin via `--input -`):
`{ layer: "A|A5|B|C|D|E", category?, style_name?, variable_text{}, reference_image_urls[], mock?, dryRun? }`

Output JSON (stdout): `{ prompt, reference_image_urls, model, style_name, category, layer, meta }`.
Errors: `{"error":{"code","message"}}` on stderr; exit 0/2/4/5/1 (matting contract).

## Anchor golden definition (important)

`nrbi-anchor_tasks.json.outfit_anchors[].prompt` is the **raw upstream input**
(`#00B140`, "Korean manhwa illustration…") that `clean_anchor_prompt`
transforms. The byte-identity target is therefore the frozen
`_build_outfit_anchor_tasks` **output** over the real 73 inputs (→ `#00FF00`,
stripped CHARACTER LOCK, `+_ANCHOR_CHROMAKEY`, optional `_ANCHOR_HEADER`,
final `normalize_prompt_for_style`), captured once into `anchor_golden.json`.

## Run

```
python3 -m pytest tools/nrbi-render-prompt/test_nrbi_render_prompt_mock.py -q
echo '{"layer":"A","variable_text":{"orig_prompt":"…"}}' | python3 tools/nrbi-render-prompt/render.py --input -
```
