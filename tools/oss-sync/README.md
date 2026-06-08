# oss-sync

Bulk-upload a local directory to Aliyun OSS under a key prefix, idempotent
on remote presence (HEAD check), with optional dry-run.

> **Not an atomic tool.** The Phase 9 design (§ 11) deliberately keeps
> oss-sync out of the opencode tool registry — the LLM has no business
> deciding to bulk-upload a folder. Use this script directly from the shell
> when you need it.

> Migrated 2026-05-15 from
> `lunaverse-backend/generate-upscale-matting/_local_tools/sync_to_oss.py`.
> Original is marked DEPRECATED there.

## Setup

```bash
cd tools/oss-sync
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Entry — JSON mode (preferred)

```bash
python sync.py --input fixtures/sync-dryrun.json
# or stdin
cat fixtures/sync-dryrun.json | python sync.py --input -
```

Input shape:

```json
{
  "source_dir": "/abs/path/to/dir",
  "oss_prefix": "nrbi/cg",
  "include_glob": "**/*.webp",
  "exclude_glob": "**/_*",
  "dry_run": true,
  "force": false
}
```

Output (stdout):

```json
{
  "uploaded": [{"local": "/tmp/x/a.webp", "key": "nrbi/cg/a.webp", "etag": "..."}],
  "skipped": [{"local": "/tmp/x/b.webp", "key": "nrbi/cg/b.webp", "reason": "remote_exists"}],
  "errors":  [],
  "meta": {"duration_ms": 42, "total": 2}
}
```

Errors go to **stderr** as `{"error":{"code":"...","message":"..."}}` with
codes `INVALID_INPUT`. Non-zero exit when any per-file error occurs.

## Dry-run

`dry_run: true` returns the plan (every file lands in `skipped[]` with
`reason: "dry_run"`) without touching OSS. Use this in CI / before
credentials are loaded.

## Environment (real uploads only)

| Variable | Purpose |
|---|---|
| `OSS_ACCESS_KEY_ID` | Aliyun access key |
| `OSS_ACCESS_KEY_SECRET` | Aliyun secret |
| `OSS_BUCKET` | Target bucket name |
| `OSS_ENDPOINT` | Region endpoint, e.g. `https://oss-cn-shanghai.aliyuncs.com` |

Dry-run mode reads none of these — safe to run anywhere.

## Legacy CLI

The original `main()` (book-slug-aware lunaverse-backend driver) lives in
the same file. Trigger it by NOT passing `--input` or `--json`:

```bash
python sync.py --book-slug new-no-rules-in-bad-ideas --dry-run
```
