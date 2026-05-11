# Novel To Video Knowledge Pack

This directory is the local self-contained source for the novel/script to prompt workflow.
It is intentionally inert: no file here is named `SKILL.md`, and nothing is auto-loaded as a runtime skill.
When the Langfuse skill is rebuilt, upload `langfuse-draft.md` or a compiled equivalent from this directory.

## Active Files

| File | Runtime role |
|---|---|
| `prompt-only-contract.md` | Default local contract for prompt generation and AB tests |
| `image-style-presets.json` | Agent-Forge image/material prompt templates |
| `video-prompt-standard.md` | Video prompt structure and character-reference rules |
| `character-reference-policy.md` | Character outfit/source-image policy |
| `seedance-core-lessons.md` | Compact Seedance model behavior lessons |
| `director-playbook-core.md` | Compact shot/director rules |
| `shot-id-policy.md` | Shot id and reference-image ordering rules |
| `nine-section-template.md` | Empty nine-section video prompt scaffold |
| `videoctl-tool-reference.md` | Local opencode `videoctl` tool usage and boundaries |
| `langfuse-draft.md` | Single-file skill body draft for later Langfuse upload |
| `source-inventory.json` | Keep/drop audit of source material |

## Removed From Repo

The old `video-agent-test/agent-skills/` tree, `legacy/`, and `cli-example/` have been removed from the active repository. Their useful prompt lessons were distilled into the active files above.

## Prompt-Only Definition

Prompt-only means producing prompt artifacts only:

- image prompt specs
- video prompt markdown
- legacy-compatible prompt JSON
- self-review
- trace summary
- manifest

It explicitly excludes image/video generation, upload, live URL validation, submit, download, frame extraction, crop, concat, and remote skill loading.
