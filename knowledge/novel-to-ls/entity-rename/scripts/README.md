# Scripts

| Script | Purpose |
|---|---|
| scan_tokens.py | Phase A: scan for unreferenced proper nouns |
| validate_map_schema.py | Pre-apply guard: structure + collisions + coverage |
| apply_rename.py | Phase C: four-category replacement with backup |
| validate_rename.py | Phase R: residual + LS integrity + dead alias |

All: `python <script>.py --help`. Exit 0=OK, 1=fail, 2=exception.
