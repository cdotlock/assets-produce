"""
Green-screen background contract for character / sprite prompts.

The MCP `style-prompts` templates (`portrait_style`, `update_portrait_style`)
historically baked "white background" into their rendered output. For the VN
engine to overlay sprites on scenes, the engine needs RGBA cutouts. The path we
chose (Option A — Google DevRel pipeline) is:

  prompt: "chromakey green background"  ->  Gemini-3 / Nano Banana Pro
                                              renders flat #00FF00 backdrop
       ->  cutout.py applies HSV keying  ->  RGBA PNG with alpha=0 on green

This module provides the suffix appended to character / sprite prompts AFTER
they come back from MCP, so `tasks_output.json` records the exact prompt that
hit the image API. Scene prompts (scene_square / scene_grid / scene_variant)
are NEVER suffixed — scenes must stay opaque.

The contract has four clauses (white-outline clause dropped 2026-04-29; it
was visible as a halo on dark scene backgrounds and cutout's 0.8px feather
already gives a clean enough edge):

  1. **Background** — pure #00FF00 chromakey green, flat and edge-to-edge,
     no shading or gradient. Hedged greens (light / blurry / gradient) break
     HSV thresholds downstream.
  2. **Zero green on the character** — any green pixel on skin, hair, eyes,
     clothing, accessories, or props will be deleted by chromakey, leaving a
     see-through hole mid-body that cannot be repaired locally (RGB is lost
     on save). This clause spells out the hidden cases models miss when only
     told "no green clothing": ambient green bounce light, green shadows,
     subsurface green skin tint, greenish-cast hair highlights.
  3. **Lighting** — neutral or warm only. No green ambient, no green bounce
     onto the character, no greenish shadow tint. Studio chromakey practice.
  4. **No reflection / glow / cast shadow** — both inflate the green region
     near the edges, which expands the keyed-out area into the body.

The outfit-level escape hatch (if the character canonically wears a green
jacket) still applies: override `{outfit}` upstream to a non-green color, or
mark `"chromakey": "skip"` in tasks_output.json to fall back to ML matting.

Usage in per-book assemble.py:

    from skills.asset_prompt_generator.green_screen import wrap_for_chromakey

    rendered = mcp.render_prompt(...)["rendered_template"]
    final_prompt = wrap_for_chromakey(rendered)
    tasks_output["series_character_prompts"][char_id]["prompt"] = final_prompt
"""
from __future__ import annotations

# Background contract, appended to character + sprite prompts (NOT scenes).
#
# Four clauses:
#   1. WHAT the background must be — flat pure #00FF00, edge-to-edge, no
#      shading or gradient. Models that hedge ("light green, blurry green,
#      green gradient") break HSV thresholds downstream.
#   2. WHAT the character must NOT contain — green pixels would be keyed out
#      of the character itself, leaving holes. The clause now explains the
#      consequence and lists the hidden cases (ambient bounce, shadows, tint)
#      that pure "no green clothing" wording misses.
#   3. WHAT the lighting must NOT do — no green ambient light, no green
#      bounce light onto skin/hair/clothing, no greenish shadow tint.
#      Studio chromakey practice mandates neutral / warm key light to avoid
#      green spill; we want the model to follow the same convention.
#   4. WHAT the model must NOT add — no shadow on the screen, no glow halo
#      around the character; both inflate the green region near the edges.
GREEN_SCREEN_SUFFIX: str = (
    "\n\n[BACKGROUND CONTRACT — chromakey green]\n"
    "1. Background: pure chromakey green (#00FF00), flat and edge-to-edge, "
    "no shading or gradient.\n"
    "2. Character body must contain ZERO green pixels — anywhere on skin, "
    "hair, eyes, clothing, accessories, props. This is critical: any green "
    "pixel on the character will be deleted during chromakey cutout, "
    "leaving a see-through hole in the body. If the outfit description "
    "mentions a green item, treat that item's colour as overridden to a "
    "non-green tone (deep navy, charcoal, burgundy, olive-brown, etc.).\n"
    "3. Lighting must be neutral or warm: NO green ambient light bouncing "
    "onto the character, NO greenish shadow tint, NO subsurface green cast "
    "on skin or hair highlights. Use white / warm key light only.\n"
    "4. Do NOT cast a shadow on the green background; do NOT add a glow "
    "halo around the character; the green plate must remain perfectly flat."
)


def wrap_for_chromakey(rendered_prompt: str) -> str:
    """Append the green-screen contract to a rendered character / sprite prompt.

    Idempotent: if the suffix is already present, returns the input unchanged.
    Use only on character (`portrait_style`) and EP sprite
    (`update_portrait_style`) prompts. Do NOT use on scene prompts.
    """
    marker = "[BACKGROUND CONTRACT — chromakey green]"
    if marker in rendered_prompt:
        return rendered_prompt
    return rendered_prompt.rstrip() + GREEN_SCREEN_SUFFIX
