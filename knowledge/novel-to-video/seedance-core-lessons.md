# Seedance Core Lessons

This is the compact active subset of the larger historical Seedance notes.

## 1. Motion Reliability Tiers

| Tier | Physical radius | Examples | Reliability | Prompting rule |
|---|---:|---|---:|---|
| strong | `>=20cm` | turning, walking, pushing a door, kneeling, grabbing, stepping back | high | plain physical description |
| medium | `5-20cm` | head turn, mouth opening, shoulder rise, gaze shift, fingers gripping fabric | medium | make it 1.5x clearer and anchor the start pose |
| weak | `<=5cm` | tears, lip tremble, pupil shift, tiny facial changes, color-temperature words | low | use at most 1-2; pair with a strong body action or use reference frames |

Do not build a shot around several weak actions. Let strong actions carry the emotion.

## 2. Reverse Calibration

Seedance tends to under-render emotional intensity. For micro-expression or emotion language, write roughly 1.5-2x stronger than the desired final result.

Do not over-amplify strong physical actions. Turning, walking, grabbing, and kneeling already render directly.

## 3. Emotion Comes From Context

Read the whole script before writing. A shot's emotion depends on what comes before and what it sets up next.

Every prompt needs:

- `shot_function`
- `prev_shot_recap`
- `next_shot_setup`
- `emotion_arc`

If those cannot be written concretely, the script has not been read enough.

## 4. Reference Layers

Use reference images by responsibility:

- space layer: scene panorama or spatial frame
- time layer: previous end frame
- identity layer: character portrait/costume image

State the responsibility of each `@图N` in the prompt. Avoid repeating detailed outfit prose when a portrait exists.

## 5. Reference Budget

More reference images can reduce the model's attention to performance text. Keep the image set lean:

- common target: 3-4 images
- five or more only when the shot truly needs it
- if many characters are present, put only the most identity-critical portraits in references and describe unreferenced characters with outline-level differences

## 6. Prompt Budget

The performance layer should dominate the prompt. Keep blocking/action/dialogue/emotion around at least half of the prompt. Trim long prohibition lists before trimming the story/action layer.

## 7. Sound And TTS

TTS responds more to sentence structure than adjectives:

- controlled authority: longer declarative sentence, no break
- restrained pain: short sentence and pause
- shock: interrupted phrase or unfinished clause
- collapse: repetition and broken syntax

For major revelations, reduce sound instead of adding dramatic music. A brief stop, low room tone, or one environmental sound is usually stronger.

## 8. Complex Continuity

For L3/L4 scenes, previous end frame and spatial frame have different jobs:

- `_end` locks the exact transition pose/expression
- `_spatial` locks layout, speaking direction, and all-character placement

If no spatial frame exists in prompt-only mode, create a `shot_anchor` image prompt that describes the intended layout; do not pretend an actual frame exists.

## 9. Multi-Character Differentiation

If a character lacks a reference image, distinguish with silhouette-level traits:

- body width/height
- gender/age band
- posture/authority
- glasses, baldness, very broad or very thin build only when essential

Do not rely on tiny color differences or near-identical age descriptions.

## 10. Action Chain Splitting

If a shot has many strong actions, split it conceptually. A single prompt should avoid more than four major physical actions. For prompt-only AB, note split recommendations in `self-review` rather than generating extra media.
