#!/usr/bin/env python3
"""
render-with-style.py — 用 style_config 远端库里的「风格」渲染 ep1 series 素材。

流程：
  1. SSH tunnel → style_config PG @ 8.133.3.63
  2. 拉 character series illustration + scene series illustration 的最新风格
  3. 用风格 prompt 模板（{{appearance}} or {{scene}}）+ 参考图 + 模型出图
  4. 输出 → moonscripts/<slug>/assets/gen-upscale/{series,scene,ep_sprites/ep1}/

依赖：sshtunnel, 'psycopg[binary]', keyring, 'paramiko<4.0', google-genai

Usage:
  python3 generate-upscale-matting/render-with-style.py [--only char:selena,scene:school_hallway] [--overwrite]
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import pathlib
import re
import sys
import time
import urllib.request
from typing import Any

# Heavy deps — guarded so the module is importable in test/CI environments
# that don't have keyring / psycopg / sshtunnel / google-genai installed.
# Production callers (main()) require all four; helper functions do not.
try:
    import keyring  # type: ignore
except ImportError:  # pragma: no cover
    keyring = None  # type: ignore[assignment]
try:
    import psycopg  # type: ignore
    from psycopg.rows import dict_row  # type: ignore
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    dict_row = None  # type: ignore[assignment]
try:
    from sshtunnel import SSHTunnelForwarder  # type: ignore
except ImportError:  # pragma: no cover
    SSHTunnelForwarder = None  # type: ignore[assignment]
try:
    from google import genai  # type: ignore
    from google.genai import types as gt  # type: ignore
except ImportError:  # pragma: no cover
    genai = None  # type: ignore[assignment]
    gt = None  # type: ignore[assignment]

# ─── Constants ─────────────────────────────────────────────────────────
# Canonical layout (2026-05): <backend>/moonscripts/<slug>/
#   ├── tasks_output.json          ← upstream agent output (synced from Dramatizer-MSS)
#   ├── characters.json            ← upstream
#   ├── scripts/ep_*.md            ← upstream
#   └── assets/
#       ├── gen-upscale/           ← phase 1+2 output (this script writes here)
#       │   ├── series/character_*.png
#       │   ├── scene/scene_*.png
#       │   └── ep_sprites/ep1/<sprite>.png
#       └── final/                 ← phase 3 output (WebP, consumed by seed)
# This script lives under <backend>/generate-upscale-matting/. Slug is
# selectable via --book-slug (defaults to no-rules-in-bad-ideas).

BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BOOK_SLUG = "no-rules-in-bad-ideas"


def book_paths(slug: str) -> dict[str, pathlib.Path]:
    book_dir = BACKEND_ROOT / "moonscripts" / slug
    assets = book_dir / "assets" / "gen-upscale"
    return {
        "book_dir":    book_dir,
        "tasks_file":  book_dir / "tasks_output.json",
        "anchor_file": book_dir / "anchor_tasks.json",  # NEW: 02.5-outfit-anchor output
        # 2026-05-13 dir consolidation: anchor/character/scene each have their
        # own top-level dir matching the post-reorg sync_to_oss layout
        # (final/{anchor,character,scene} → nrbi/{anchor,character,bg}). The
        # 5070Ti client reads from these top-level dirs via --kind=<group>.
        # series/ now holds only grid composites (intermediate, not uploaded).
        "out_series":  assets / "series",        # grid composites only (scene_<loc>_grid.png)
        "out_character": assets / "character",   # per-character card (character_<cid>.png)
        "out_scene":   assets / "scene",         # final scene PNGs (scene_<sid>.png)
        "out_anchors": assets / "anchor",        # per (char × outfit) anchors (<char>_<outfit>.png)
        # 2026-05-07: flattened to ep_sprites/<sprite_id>.png. sprite_ids are
        # globally unique after 06 dedup + outfit_fold (1509 IDs in NRBI), so
        # per-ep subdirs fragment output without adding info. Removes the
        # previous ep1-only hardcode that clobbered cross-ep sprites.
        "out_sprites": assets / "ep_sprites",
    }

# ep1 取自前面 mss compile 的 step 引用
EP1_CHARS = ["selena", "diego", "luca", "weston", "xiomara", "mariana", "camila"]
# scene 描述抽取自 tasks_output.json 中两个 parent grid 的【格 N】行（school + selena_house）
EP1_SCENES: dict[str, str] = {
    "selena_house_bedroom": "Selena 的卧室：未整理的双人床、溢满衣物的开放式 wardrobe、蝴蝶形墙贴照片、fairy lights、晨光从左侧窗户射入",
    "school_hallway":       "Westbluff 学院 走廊：两侧木 locker、石地板深景 vanishing、黄铜壁灯暖光、顶部 skylight 冷光条",
    "school_cafeteria":     "Westbluff 学院 食堂：长 oak 共享桌、中央圆形 basketball 桌、暖 pendant 灯 vs 北向冷窗光",
    "school_parking_lot":   "Westbluff 学院 停车场：奢华 SUV 与轿车成排、铁艺围栏、清晨低角度太阳投长影",
    "school_ap_classroom":  "Westbluff 学院 AP 英语教室：木书桌排列、右墙拱形窗光、左墙到顶 oak 书架、顶部 pendant 暖光",
}

# Scene grid task type — added 2026-05-07 per chromakey-grid-merge plan.
# A "grid" is a 1:1 multi-panel reference image showing 4-5 sub_locations
# sharing visual style (same lighting / palette / decor signature). The
# sub_locations consume this as `dynamic_grid_panel` reference during their
# own square-aspect render.
SCENE_GRID_CATEGORY = "scene grid illustration"
CHAR_SERIES_CATEGORY = "character series illustration"
SCENE_SERIES_CATEGORY = "scene series illustration"
CHAR_EP_CATEGORY = "character ep illustration"
# Local-only category — no style_config row, anchors reuse character_series style
OUTFIT_ANCHOR_CATEGORY = "outfit anchor"
LAYER_CONCURRENCY = 10

ZENMUX_BASE_URL = "https://zenmux.ai/api/vertex-ai"
SSH_HOST = "8.133.3.63"
PG_DB = "style_config"
PG_USER = "style_config"
KEYCHAIN_SERVICE = "style_config"
CONCURRENCY = 4
MAX_RETRIES = 3
RETRY_DELAY_S = 5

# Aspect-ratio guard (added 2026-05-09). mob-ai's image-gpt has ~13% drift
# rate where it ignores the prompt's "9:16 全身立绘竖构图" / "FRAMING: 9:16
# vertical canvas" wording and falls back to 1024×1536 (2:3). Probe confirmed
# the API does NOT accept size/aspect_ratio body fields, so the only reliable
# hard constraint is client-side: render → check W/H → retry if drift.
# Categories not listed here skip the check (no expected aspect).
_EXPECTED_ASPECT_BY_CATEGORY: dict[str, float] = {
    CHAR_SERIES_CATEGORY:   9 / 16,  # 0.5625 — series character立绘
    OUTFIT_ANCHOR_CATEGORY: 9 / 16,  # 0.5625 — outfit anchor (Layer A.5)
    CHAR_EP_CATEGORY:       9 / 16,  # 0.5625 — sprites (Layer E)
    SCENE_GRID_CATEGORY:    1.0,     # 1:1 — scene grid
    SCENE_SERIES_CATEGORY:  1.0,     # 1:1 — standalone scenes + scene squares
}
_ASPECT_TOLERANCE = 0.03  # ±3% — allows 941×1672 (0.5628) and 1024×1024 (1.0)
                          # but rejects 1024×1536 (0.667) for 9:16 cohort.

# 抽取角色 appearance：从 tasks_output 原 prompt 里第一个"无文字。"之后到 [BG CONTRACT] 之前
_APPEARANCE_RE = re.compile(r"^.*?，无文字。\s*(.+?)\s*\[BACKGROUND CONTRACT", re.DOTALL)


# ─── secrets ───────────────────────────────────────────────────────────

def kc(name: str) -> str:
    """Resolve a secret. Prefer env var, fall back to macOS keychain.

    Env var lookup makes the script work without keyring on machines that
    have a populated .env (e.g. CI, fresh dev boxes). Keyring stays as the
    canonical source on shared dev machines.
    """
    v = os.environ.get(name)
    if v:
        return v
    if keyring is None:
        sys.exit(f"keyring module not installed and {name!r} not in env")
    v = keyring.get_password(KEYCHAIN_SERVICE, name)
    if not v:
        sys.exit(f"missing secret: env var {name!r} not set and not in keychain "
                 f"(service={KEYCHAIN_SERVICE!r} name={name!r})")
    return v


# ─── style DB loader (one-shot) ────────────────────────────────────────

def load_styles_from_cache(cache_path: pathlib.Path,
                           style_name_filter: str | None = None) -> dict[str, dict[str, Any]]:
    """Load styles from a local JSON cache (alternative to SSH+PG).

    Use case: avoid keyring/SSH tunnel setup when iterating locally.
    Cache is a JSON list of style row dicts, dumped via:
        sudo -u postgres psql -d style_config -t -A \\
            -c "SELECT json_agg(...) FROM (SELECT ... FROM styles ORDER BY created_at DESC) s;"

    Picks the most-recent style per category (rows assumed DESC sorted on dump).
    If `style_name_filter` is given, only rows whose name starts with the prefix
    are considered — useful to pin a particular style family (e.g. 'YA_Impasto').
    Also normalizes the legacy 'image-gpt' shorthand to the canonical
    'openai/gpt-image-2' so the dispatcher routes to edit_image.
    """
    rows = json.loads(cache_path.read_text())
    # Filter is a PREFERENCE per category, not a hard cut. We pick the most
    # recent matching row for each category; if no match exists for a given
    # category we fall back to the most recent row of that category from the
    # full dump. This handles the case where the YA_Impasto family only ships
    # 3 categories (char/scene/grid) and the legacy 'update_character' row is
    # still the canonical 'character ep illustration' style.
    by_cat: dict[str, dict] = {}
    if style_name_filter:
        prefer = [r for r in rows if (r.get("name") or "").startswith(style_name_filter)]
        for r in prefer:
            if r.get("category") and r["category"] not in by_cat:
                by_cat[r["category"]] = r
    # Fill in remaining categories from the unfiltered set.
    for r in rows:
        if r.get("category") and r["category"] not in by_cat:
            by_cat[r["category"]] = r
    # Note: 'image-gpt' (and other 'image-*' names) are routed to mob-ai by
    # render_image(); they're NOT normalized to 'openai/gpt-image-2' which would
    # send them to zenmux instead. Both backends can render the same model id,
    # but the canonical path for image-* is mob-ai per style_config server.
    return by_cat


def load_styles() -> dict[str, dict[str, Any]]:
    """Pulls latest style per category for the two we care about. Returns a
    dict keyed by category name."""
    with SSHTunnelForwarder(
        SSH_HOST,
        ssh_username="root",
        ssh_password=kc("SSH_PASSWORD"),
        remote_bind_address=("127.0.0.1", 5432),
        local_bind_address=("127.0.0.1", 0),
    ) as tunnel:
        with psycopg.connect(
            host="127.0.0.1",
            port=tunnel.local_bind_port,
            dbname=PG_DB,
            user=PG_USER,
            password=kc("PG_PASSWORD"),
            row_factory=dict_row,
            connect_timeout=10,
        ) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT DISTINCT ON (category) *
                       FROM styles
                       WHERE category IN ('character series illustration',
                                          'scene series illustration',
                                          'scene grid illustration',
                                          'character ep illustration')
                       ORDER BY category, created_at DESC"""
                )
                rows = cur.fetchall()
    return {r["category"]: r for r in rows}


# ─── prompt assembly ───────────────────────────────────────────────────

def render_prompt(template: str, subject: str) -> str:
    """Replace any {{...}} placeholder in the template with subject text.
    Style templates use either {{appearance}} (character) or {{scene}}
    (scene); we don't care which name, just substitute all."""
    out = re.sub(r"\{\{\w+\}\}", subject, template)
    if "{{" not in template:  # no placeholder at all → append
        out = f"{template.rstrip()}\n\n{subject}"
    return out


def extract_appearance(orig_prompt: str) -> str:
    m = _APPEARANCE_RE.match(orig_prompt)
    if m:
        return m.group(1).strip()
    if "无文字。" in orig_prompt:
        body = orig_prompt.split("无文字。", 1)[1]
        return body.split("[BACKGROUND CONTRACT", 1)[0].strip()
    return orig_prompt.strip()


# Sprite reinforcement: tasks_output sprites self-describe an outfit (which can
# drift from the actual series portrait), and gpt/gemini sometimes emit anatomy
# faults (3 hands) or background drift. Override the outfit line to defer to
# image 1, and append hard constraints.
_OUTFIT_RE = re.compile(r"着装：[^。]+。")


def build_sprite_text(orig_prompt: str) -> str:
    text = extract_appearance(orig_prompt)
    text = _OUTFIT_RE.sub(
        "着装：完全保持图 1 的所有衣物、配饰、鞋履、首饰，禁止任何细节变化。",
        text,
        count=1,
    )
    text += (
        "\n\n【硬约束 / Hard Constraints — 必须严格遵守】"
        "\n1) 解剖严格正确：恰好 1 个头 / 1 个身体 / 2 条手臂（共 2 只手）/ 2 条腿（共 2 只脚）；"
        "禁止出现第 3 只手、额外手臂、悬浮的手、镜像复制的肢体。"
        "\n2) 背景：平涂纯绿幕 #00FF00，无渐变、无阴影、无任何场景元素或道具。"
        "\n3) 着装、面部五官、发型、发色、肤色、配饰、首饰、鞋履，全部与图 1 像素级一致，"
        "禁止任何颜色、款式、图案、长度的变化。"
        "\n4) 当前文字描述若与图 1 视觉冲突，一律以图 1 为准。"
    )
    return text


# Anchor prompt cleaner: 02.5-outfit-anchor stuffs bible.appearance_anchor into
# CHARACTER LOCK section, which mixes face/body anchors with personality flavor
# (motorcycle/读书/flicking middle finger…) and a wardrobe list (Brandy Melville
# 风吊带裙 / 红丝绸连衣裙 / 高腰牛仔 + crop top). The wardrobe list contradicts
# the OUTFIT (verbatim) section directly below, and the personality flavor
# contradicts POSE LOCK neutral. We strip both in backend so the anchor prompt
# is "face + body anchor" only — phase-2 should fix this upstream in 02.5.
_ANCHOR_LOCK_RE = re.compile(
    r"(CHARACTER LOCK[^\n]*\n)(.*?)(\n\nOUTFIT \(verbatim)",
    re.DOTALL,
)

_ANCHOR_HEADER = (
    "图 1 是该角色的 series 立绘 reference — 必须严格保留图 1 的脸型/五官/"
    "瞳色/发色/肤色/身高比例与体型曲线;在此基础上只更改服装为下方 OUTFIT "
    "段、并保持 POSE LOCK 的 neutral pose。\n\n"
)

_ANCHOR_CHROMAKEY = (
    "\n[CHROMAKEY GREEN BACKGROUND CONTRACT]\n"
    "1) 背景必须是平涂 #00FF00 纯绿,无渐变/阴影/光晕,边到边铺满。\n"
    "2) 人物身上零绿像素 — 皮肤/头发/眼睛/衣物/配饰任何位置都不能有绿色;"
    "若 OUTFIT 里提到绿色物件,改用深海军/炭黑/酒红/橄榄棕等非绿色。\n"
    "3) 中性或暖光主光源,禁止绿色环境光、禁止绿色阴影、禁止人物皮肤/头发"
    "高光泛绿。\n"
    "4) 所有衣物面料一律渲染为完全不透明 (fully opaque) — 即便 OUTFIT 描述"
    "提到 chiffon / sheer / mesh / lace / organza / tulle / 雪纺 / 透视 / "
    "网纱 / 蕾丝 / 薄纱 等半透明材质,在这张绿幕底片上也必须画成实色等效 "
    "(solid-color equivalent),绝不能让绿色背景透过任何衣物区域露出。袖口、"
    "下摆、披纱、领口、丝袜等附属织物同样要不透明。半透明感如有需要由后期"
    "合成补回,绿幕底片只画衣物本体,不画背景透过衣物的效果。"
)


def _clean_character_lock(prompt: str) -> str:
    """Strip personality bullets + wardrobe list inside CHARACTER LOCK section."""
    m = _ANCHOR_LOCK_RE.search(prompt)
    if not m:
        return prompt
    head, body, tail = m.group(1), m.group(2), m.group(3)
    visual_lines = [l for l in body.split('\n') if not l.lstrip().startswith('-')]
    visual = '\n'.join(visual_lines).strip()
    if ';' in visual:
        visual = visual.split(';', 1)[0].strip()
    return prompt[:m.start()] + head + visual + tail + prompt[m.end():]


def clean_anchor_prompt(raw_prompt: str) -> str:
    """Apply Layer A.5 prompt patches:
    1) Strip CHARACTER LOCK personality bullets + wardrobe list.
    2) Align background hex with Layer A + cutout.py (#00B140 → #00FF00).
    3) Append chromakey hard contract.
    Note: ref-index header (`图 1 是 reference…`) is added by
    `_bind_series_portrait_for_anchor` only when a ref is actually bound,
    so text-to-image primary anchors don't reference a non-existent image."""
    cleaned = _clean_character_lock(raw_prompt)
    cleaned = cleaned.replace("#00B140", "#00FF00")
    return cleaned + _ANCHOR_CHROMAKEY


# Layer B (scene grid) prompt rebuild: 06's grid.prompt was authored against
# Korean-manhwa style ("韩漫画风, 电影级氛围, 精细的线稿") and contains long
# multi-line cinematic-lighting descriptions that normalize_prompt_for_style
# can't translate to YA Impasto. Strategy: extract the only two pieces 06
# actually contributes — grid_size (the 数字 in "请生成一张 N 宫格") and
# grid_cells (the 【格 N】... bullet block) — and re-fill the team's
# YA_Impasto_grid template. Team head + 06 cells.
_GRID_SIZE_RE = re.compile(r"(\d+)\s*宫格")
_GRID_CELLS_RE = re.compile(r"每格内容[^：]*：\s*\n(.+)$", re.DOTALL)


def rebuild_grid_prompt(raw_prompt: str, grid_template: str) -> str:
    """Backend extracts grid_size + grid_cells from upstream 06 grid prompt and
    refills team's YA_Impasto_grid template, dropping the 'Korean manhwa +
    cinematic lighting' style head from 06 in favor of the YA Impasto head.

    Falls back to raw_prompt if extraction fails (defensive: don't render with
    an empty/bad template if upstream schema changes)."""
    s = _GRID_SIZE_RE.search(raw_prompt)
    c = _GRID_CELLS_RE.search(raw_prompt)
    if not (s and c):
        return raw_prompt
    return (grid_template
            .replace("{{grid_size}}", s.group(1))
            .replace("{{grid_cells}}", c.group(1).strip()))


# Layer C (scene square) prompt rebuild: same vocab problem as Layer B, but
# the team's YA_Impasto_scene template doesn't fit Layer C's semantic
# (Layer C is "grid → square enlarge", not "scene from scratch"). Backend
# constructs an inline template that:
#   - tells model 图 1 is the grid ref (Layer C ref_paths is the grid PNG)
#   - asks to pick the specific sub-location panel and enlarge to 1:1
#   - declares YA Impasto style vocab
#   - drops 电影级光影 from upstream 06 prompt
# Only contribution from 06 is `sub_location_name` (already a separate field
# in 06's output, no extraction regex needed).
_SCENE_SQUARE_TEMPLATE = (
    "参考图 1(场景 grid 参考图),从中选取【{sub_location}】这一格,"
    "放大成 1:1 方形尺寸的场景空镜图。"
    "画风:现代 YA 图像小说风格,欧美动漫画风,数字柔和平涂,以平涂的质感为主,"
    "保持与图 1 一致的统一画风、光线方向与调色氛围,场景中的布景可以有细微纹理。"
    "景深与大气透视:近景锐利,中景柔化,远景略微褪色。"
    "画面中没有任何文字和人物。"
)


def build_scene_square_prompt(sub_location_name: str) -> str:
    """Backend-constructed Layer C prompt. Drops 06's 'Korean manhwa + cinematic'
    description; replaces with YA Impasto vocab. 图 1 = grid ref bound at
    runtime by _bind_grid_reference. sub_location_name comes from upstream 06
    as a separate field."""
    return _SCENE_SQUARE_TEMPLATE.format(sub_location=sub_location_name)


# Layer E (sprite) prompt sanitizer: 06's anchor-locked sprite prompts hardcode
# chromakey hex #00B140 (RGB 0,177,64), but cutout.py and Layer A both use
# #00FF00 (RGB 0,255,0). The hex mismatch causes inconsistent green plates
# across layers, which surfaces as edge artifacts in the matting pipeline.
# Phase-2 should fix this in 06 upstream (tasks_output.json), but for now
# backend rewrites the hex inline.
def clean_sprite_prompt(raw_prompt: str) -> str:
    """Align sprite chromakey hex with Layer A + cutout.py.
    Style-vocab swap (韩漫画风 → 现代 YA 图像小说风格 + Chinese-punctuation fix)
    is handled separately in normalize_prompt_for_style at render_image() time."""
    return (raw_prompt
            .replace("#00B140", "#00FF00")
            .replace("RGB 0,177,64", "RGB 0,255,0"))


# ─── image generation ──────────────────────────────────────────────────

def fetch_url(url: str, retries: int = 3) -> tuple[bytes, str]:
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "backend-render/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read(), (r.headers.get("Content-Type") or "image/png")
        except Exception as e:
            last = e
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"fetch_url failed after {retries} attempts: {last}") from last


# ─── mob-ai image API adapter (image-* models) ─────────────────────────


def render_via_mob_ai(model: str, prompt: str, refs: list[tuple[bytes, str]]) -> bytes:
    """Render via mob-ai's POST /api/v1/generations.

    Mirrors style_config server.py's _generate_via_mob_ai dispatch so backend
    and style_config use the same canonical path for `image-*` models.

    Reference handling: mob-ai expects URL refs, not inline bytes. We upload
    each ref to our OSS bucket (idempotent, content-hash key) and pass URLs.
    """
    import requests  # type: ignore
    api_key = os.environ.get("MOB_AI_API_KEY")
    if not api_key:
        sys.exit("MOB_AI_API_KEY missing (load via .env or shell env)")
    base = os.environ.get("MOB_AI_BASE_URL", "https://ai.mob-ai.cn").rstrip("/")

    ref_urls = [_upload_ref_to_oss(b, m) for b, m in refs]

    body = {
        "model": model,
        "input": {
            "prompt": prompt,
            "references": [{"type": "image", "url": u} for u in ref_urls],
        },
    }
    # mob-ai gen takes 60-120s typically; 1200s ceiling for worst case
    resp = requests.post(
        f"{base}/api/v1/generations",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=1200,
    )
    resp.raise_for_status()
    data = resp.json()

    status = data.get("status")
    if status and status != "succeeded":
        raise RuntimeError(f"mob-ai generation failed: {data}")

    image_url = (
        (data.get("output") or {}).get("url")
        or data.get("result")
        or (data.get("images") or [{}])[0].get("url")
    )
    if not image_url:
        raise RuntimeError(f"mob-ai response missing image url: {data}")

    img = requests.get(image_url, timeout=60)
    img.raise_for_status()
    return img.content


# ─── Z-image-turbo (Wavespeed REST i2i) adapter ────────────────────────

_WAVESPEED_KEY: str | None = None
_OSS_HELPER: tuple | None = None  # (oss2.Bucket, host_str, bucket_name)


def _wavespeed_key() -> str:
    """Resolve Wavespeed key (lazy). Reads env var; not stored in keyring."""
    global _WAVESPEED_KEY
    if _WAVESPEED_KEY is None:
        _WAVESPEED_KEY = os.environ.get("WAVESPEED_API_KEY")
        if not _WAVESPEED_KEY:
            sys.exit("WAVESPEED_API_KEY missing (load via .env or shell env)")
    return _WAVESPEED_KEY


def _oss_helper() -> tuple:
    """Lazy-init oss2 Bucket. Returns (bucket, endpoint_host, bucket_name).

    Reads OSS_BUCKET / OSS_ENDPOINT / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
    from env (loaded from .env at main() entry). Used to host i2i ref images
    publicly so Wavespeed can fetch them.
    """
    global _OSS_HELPER
    if _OSS_HELPER is None:
        import oss2  # type: ignore
        endpoint = os.environ.get("OSS_ENDPOINT") or "https://oss-us-west-1.aliyuncs.com"
        bucket_name = os.environ["OSS_BUCKET"]
        auth = oss2.Auth(os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"])
        bucket = oss2.Bucket(auth, endpoint, bucket_name)
        host = endpoint.replace("https://", "").replace("http://", "").rstrip("/")
        _OSS_HELPER = (bucket, host, bucket_name)
    return _OSS_HELPER


def _upload_ref_to_oss(ref_bytes: bytes, mime: str = "image/png") -> str:
    """Upload an i2i reference image; key by content-sha for natural dedup.
    Idempotent: HEAD-checks before PUT. Returns the public URL."""
    bucket, host, bucket_name = _oss_helper()
    sha = hashlib.sha256(ref_bytes).hexdigest()[:16]
    ext = "png" if "png" in mime.lower() else "jpg"
    key = f"nrbi/_zimage_refs/{sha}.{ext}"
    try:
        bucket.head_object(key)
    except Exception:
        bucket.put_object(key, ref_bytes)
    return f"https://{bucket_name}.{host}/{key}"


def render_z_image_turbo(prompt: str, refs: list[tuple[bytes, str]],
                         size: str = "1024*1024",
                         strength: float = 0.35) -> bytes:
    """Wavespeed Z-image-turbo i2i: upload first ref → submit job → poll → return PNG.

    `refs[0]` is the i2i source image (image-1 priority semantics, matching
    gemini's "图 1" anchor convention used by sprite/anchor prompts).
    Strength=0.35 was empirically validated by 2026-05-02 model-comparison —
    locks anchor outfit while allowing pose/expression delta.
    """
    import requests  # type: ignore
    if not refs:
        raise RuntimeError("z-image-turbo requires at least 1 reference image (i2i only)")
    ref_bytes, ref_mime = refs[0]
    image_url = _upload_ref_to_oss(ref_bytes, ref_mime)

    submit = requests.post(
        "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image-turbo/image-to-image",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {_wavespeed_key()}"},
        json={"image": image_url, "prompt": prompt, "size": size,
              "strength": strength, "seed": -1, "output_format": "png",
              "enable_sync_mode": False, "enable_base64_output": False},
        timeout=60,
    )
    submit.raise_for_status()
    req_id = submit.json()["data"]["id"]

    deadline = time.time() + 180
    while time.time() < deadline:
        r = requests.get(
            f"https://api.wavespeed.ai/api/v3/predictions/{req_id}/result",
            headers={"Authorization": f"Bearer {_wavespeed_key()}"},
            timeout=30,
        )
        r.raise_for_status()
        body = r.json()["data"]
        if body["status"] == "completed":
            return requests.get(body["outputs"][0], timeout=60).content
        if body["status"] == "failed":
            raise RuntimeError(f"wavespeed failed: {body.get('error')}")
        time.sleep(2)
    raise TimeoutError(f"wavespeed timeout for req {req_id}")


# ─── Prompt normalizer (style-family-aware swap) ───────────────────────

def normalize_prompt_for_style(prompt: str, style_family: str | None) -> str:
    """Rewrite upstream-baked style words so prompt and reference image align.

    Upstream tasks_output.json was generated for korean-manga-style (prompts
    contain '韩漫画风' / '电影级氛围' literals). When rendering with a different
    style family, the prompt-text must be aligned with the new style's reference
    image, otherwise prompt and image guide the model in opposite directions.

    Currently only YA_Impasto is supported. Adding more families = adding a
    new `if` branch with the appropriate substitutions.
    """
    if not style_family or not prompt:
        return prompt
    if style_family.startswith("YA_Impasto"):
        # Chinese descriptors (sprite/scene/grid prompts in tasks_output.json).
        # 2026-05-08: regex now eats trailing punctuation (,|，|。)? and the
        # replacement uses Chinese 「，」, otherwise we get「数字柔和平涂,，」style
        # mixed-punctuation collisions where the original was followed by 「，」.
        # First rule's replacement also ends with 「，」 to act as the delimiter
        # before the next vocab; other rules end without trailing punct because
        # their original positions were typically at sentence boundaries.
        prompt = re.sub(r'韩漫画风(,|，|。)?', '现代 YA 图像小说风格，数字柔和平涂，', prompt)
        prompt = re.sub(r'电影级氛围与精致质感(,|，|。)?', 'YA 漫画的氛围，平涂质感', prompt)
        prompt = re.sub(r'精细的线稿(,|，|。)?', '柔和数字平涂，脸部无勾线靠色块塑造五官', prompt)
        prompt = re.sub(r'欧美骨相', '欧美五官', prompt)
        # English descriptors (anchor_tasks.json prompts are in English)
        prompt = re.sub(r'Korean manhwa illustration',
                        'Modern YA graphic novel illustration, soft digital flat colors',
                        prompt)
        prompt = re.sub(r'Korean manhwa', 'YA graphic novel', prompt)
        prompt = re.sub(r'Clean ink outlines, flat color fills',
                        'Soft digital flat colors, faces shaped by color blocks (no hard ink outlines on face)',
                        prompt)
    return prompt


# Module-level holder so render_with_retry knows current style family.
# Set in main() based on --style-family or inferred from style row name.
_CURRENT_STYLE_FAMILY: str | None = None


def render_image(client: genai.Client, model: str, prompt: str,
                 refs: list[tuple[bytes, str]]) -> bytes:
    # NEW: rewrite prompt for the active style family (no-op if family unset)
    prompt = normalize_prompt_for_style(prompt, _CURRENT_STYLE_FAMILY)
    # NEW: image-* models go to mob-ai (matches style_config server's dispatcher)
    if model.startswith("image-"):
        return render_via_mob_ai(model, prompt, refs)
    # NEW: Z-image-turbo via Wavespeed (i2i only)
    if model in ("z-image-turbo", "wavespeed-ai/z-image-turbo"):
        return render_z_image_turbo(prompt, refs)
    # Legacy zenmux paths (provider-prefixed model names)
    if model == "openai/gpt-image-2":
        ref_objs = [
            gt.RawReferenceImage(
                reference_id=i + 1,
                reference_image=gt.Image(image_bytes=b, mime_type=m),
            )
            for i, (b, m) in enumerate(refs)
        ]
        if ref_objs:
            resp = client.models.edit_image(
                model=model, prompt=prompt, reference_images=ref_objs
            )
        else:
            resp = client.models.generate_images(model=model, prompt=prompt)
        return resp.generated_images[0].image.image_bytes
    # gemini family
    parts: list[Any] = [gt.Part.from_text(text=prompt)]
    for b, m in refs:
        parts.append(gt.Part.from_bytes(data=b, mime_type=m))
    resp = client.models.generate_content(
        model=model,
        contents=parts,
        config=gt.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
    )
    for cand in resp.candidates or []:
        for p in (cand.content.parts if cand.content else []) or []:
            if getattr(p, "inline_data", None) and p.inline_data.data:
                return p.inline_data.data
    raise RuntimeError("no image part in model response")


def _check_aspect_ratio(png_bytes: bytes, category: str | None) -> tuple[bool, str]:
    """Validate generated image's W/H against the expected aspect for `category`.
    Returns (is_ok, detail). Categories not in _EXPECTED_ASPECT_BY_CATEGORY pass
    through (is_ok=True). Used by render_with_retry to drive client-side retries
    when mob-ai's image-gpt ignores the prompt's '9:16' soft constraint."""
    if not category or category not in _EXPECTED_ASPECT_BY_CATEGORY:
        return (True, "")
    expected = _EXPECTED_ASPECT_BY_CATEGORY[category]
    try:
        from io import BytesIO
        from PIL import Image  # type: ignore
        with Image.open(BytesIO(png_bytes)) as im:
            w, h = im.size
        actual = w / h
    except Exception as e:
        # If we can't decode, treat as accept (the upstream save will likely
        # fail too and surface a clearer error). Don't gate the pipeline on
        # a metadata read.
        return (True, f"aspect_check_skipped: {type(e).__name__}: {e}")
    if abs(actual - expected) <= _ASPECT_TOLERANCE:
        return (True, f"aspect_ok({w}x{h})")
    return (False, f"aspect_drift({w}x{h} ratio={actual:.3f} expected~{expected:.3f})")


def render_with_retry(client, model, prompt, refs, out_path: pathlib.Path,
                      overwrite: bool, category: str | None = None) -> tuple[str, str]:
    if out_path.exists() and not overwrite:
        return ("skip", "already exists")
    last = ""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            png = render_image(client, model, prompt, refs)
            # 2026-05-09: client-side aspect-ratio guard. mob-ai's image-gpt
            # silently drifts ~13% to 1024×1536 (2:3) instead of the prompt's
            # 9:16, and the API doesn't accept size hints. We re-attempt
            # without writing the bad PNG to disk so the next run isn't
            # blocked by skip-if-exists pinning a wrong-ratio file.
            ok, ar_detail = _check_aspect_ratio(png, category)
            if not ok:
                last = f"attempt {attempt} {ar_detail}"
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY_S)
                    continue
                # Final attempt also drifted — fail hard, do NOT save the bad
                # PNG. Caller will surface "fail" status; user can re-run to
                # try again, or accept the drift via --skip-aspect-guard
                # (not implemented yet — escape hatch for future need).
                return ("fail", f"aspect_drift_after_{MAX_RETRIES}_attempts: {last}")
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(png)
            return ("ok", str(out_path))
        except Exception as e:
            last = f"{type(e).__name__}: {str(e)[:240]}"
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY_S)
    return ("fail", last)


# ─── DAG helpers ───────────────────────────────────────────────────────
# A "task" is a plain dict with these keys (some optional, populated by _bind_*):
#   label             — human label, e.g. "char:selena", "grid:school"
#   category          — style_config category key
#   model             — image model id (from style row)
#   prompt            — fully-rendered prompt string
#   static_refs       — list[tuple[bytes, str]] preloaded style ref images
#   ref_paths         — list[pathlib.Path] dynamic refs (read at run time)
#   out_path          — pathlib.Path destination PNG
#   parent_location_id, baseline_scene_id, character_id — for _bind_* lookups


def _filter_label(label: str, only_filter: set[str] | None) -> bool:
    """True ⇒ keep this task. None means keep all."""
    if only_filter is None:
        return True
    return label in only_filter


def _build_series_character_tasks(
    tasks_output: dict,
    book_paths: dict[str, pathlib.Path],
    style_table: dict[str, dict],
    static_refs: dict[str, list[tuple[bytes, str]]],
    only_filter: set[str] | None,
) -> list[dict]:
    """Layer A: series character portraits. Pulls appearance from
    tasks_output.series_character_prompts.<id>.prompt, fills char-style
    template. No deps."""
    style = style_table[CHAR_SERIES_CATEGORY]
    refs = static_refs.get(CHAR_SERIES_CATEGORY, [])
    out: list[dict] = []
    char_prompts = tasks_output.get("series_character_prompts") or {}
    # No legacy fallback to EP1_CHARS: when tasks_output lacks per-character
    # prompts there is nothing to extract from, so the iteration is the empty
    # list and we return [] — same observable behaviour, without a dead guard.
    for cid, spec in char_prompts.items():
        appearance = extract_appearance(spec["prompt"])
        prompt = render_prompt(style["prompt"], appearance)
        # 2026-05-07: re-attach chromakey hard contract. The team style template
        # only says "绿幕背景，必须保证人物便于抠图" — too soft for our matting
        # pipeline (Layer 6 cutout.py is unforgiving about green spill on the
        # character body). The 06 prompts had a strict [BACKGROUND CONTRACT]
        # block that extract_appearance correctly drops to keep {{appearance}}
        # focused on the body — we re-attach the contract here so the model
        # gets it as a constraint, not as part of the character description.
        prompt += (
            "\n\n[CHROMAKEY GREEN BACKGROUND CONTRACT]\n"
            "1) 背景必须是平涂 #00FF00 纯绿,无渐变/阴影/光晕,边到边铺满。\n"
            "2) 人物身上零绿像素 — 皮肤/头发/眼睛/衣物/配饰任何位置都不能"
            "有绿色;若 appearance 里提到绿色物件,改用深海军/炭黑/酒红/"
            "橄榄棕等非绿色。\n"
            "3) 中性或暖光主光源,禁止绿色环境光、禁止绿色阴影、禁止人物"
            "皮肤/头发高光泛绿。\n"
            "4) 不要给绿色背景投阴影,不要给人物加 halo/光晕,绿幕必须保持平整。"
        )
        label = f"char:{cid}"
        if not _filter_label(label, only_filter):
            continue
        out.append({
            "label": label,
            "category": CHAR_SERIES_CATEGORY,
            "model": style["model"],
            "prompt": prompt,
            "static_refs": refs,
            "ref_paths": [],
            "out_path": book_paths["out_character"] / f"character_{cid}.png",
            "character_id": cid,
        })
    return out


def _build_outfit_anchor_tasks(
    book_paths: dict[str, pathlib.Path],
    style_table: dict[str, dict] | None = None,
    only_filter: set[str] | None = None,
) -> list[dict]:
    """Layer A.5: outfit anchors — one PNG per (char × outfit) combo.

    Reads anchor_tasks.json (produced upstream by 02.5-outfit-anchor; NOT
    in tasks_output.json). Each anchor uses the matching series character
    PNG as a reference image (bound at runtime by
    _bind_series_portrait_for_anchor, after Layer A drains).

    out_path = series/anchors/<char>_<outfit>.png — Layer E sprites then
    use this anchor as their i2i reference (instead of series character),
    so sprite outfits stay locked to the chosen wardrobe."""
    if style_table is None:
        style_table = {}
    anchor_file = book_paths.get("anchor_file")
    if not anchor_file or not anchor_file.exists():
        return []
    try:
        data = json.loads(anchor_file.read_text())
    except Exception as exc:
        print(f"[anchors] WARN: could not parse {anchor_file.name}: {exc}",
              file=sys.stderr)
        return []
    # Anchors share Layer A's character style, so they always use the same
    # model the series character was rendered with. Upstream spec.model is
    # ignored (it may be 'nano-banana-pro' from the legacy n2m pipeline,
    # which would route to genai/Zenmux instead of mob-ai/Wavespeed).
    char_style = style_table.get(CHAR_SERIES_CATEGORY)
    if not char_style:
        # Style cache doesn't define char series → can't render anchors.
        print("[anchors] WARN: no character series style in cache; "
              "Layer A.5 will be empty", file=sys.stderr)
        return []
    out: list[dict] = []
    for spec in data.get("outfit_anchors") or []:
        char_id = spec.get("char_id") or spec.get("character_id")
        outfit_id = spec.get("outfit_id")
        prompt = spec.get("prompt")
        if not (char_id and outfit_id and prompt):
            continue
        label = f"anchor:{char_id}_{outfit_id}"
        if not _filter_label(label, only_filter):
            continue
        # 2026-05-08: clean CHARACTER LOCK + align bg hex + append chromakey
        # contract. ref-index header is added later in _bind_series_portrait_for_anchor
        # only when a ref is actually bound.
        prompt = clean_anchor_prompt(prompt)
        out.append({
            "label": label,
            "category": OUTFIT_ANCHOR_CATEGORY,
            "model": char_style["model"],
            "prompt": prompt,
            "static_refs": [],
            "ref_paths": [],
            "out_path": book_paths["out_anchors"] / f"{char_id}_{outfit_id}.png",
            "character_id": char_id,
            "outfit_id": outfit_id,
        })
    return out


def _bind_series_portrait_for_anchor(task: dict, book_paths: dict[str, pathlib.Path]) -> dict:
    """Inject a face/body i2i reference into anchor tasks, with two-tier fallback:

    Tier 1 — series character: if Layer A produced character_<char>.png, use it
        (preferred path; selena/diego/luca/etc. have these).

    Tier 2 — sibling anchor (chained i2i): for chars without a series PNG that
        have ≥2 outfits (NRBI: brielle, tatiana, ximena), look for an already-
        rendered sibling anchor of the same char. The DAG splits A.5 into
        A.5a (primary, text-to-image) + A.5b (secondary, refs primary), so by
        the time A.5b binds, A.5a has populated out_anchors/<char>_*.png.

    Tier 3 — text-to-image: no ref available (single-outfit supporting cast,
        OR the primary anchor of a multi-outfit no-series-PNG char). Face is
        free-rendered; flag for reviewer.

    Conditional header: prepend "图 1 是 reference…" ONLY when ref is bound,
    so text-to-image prompts don't reference a non-existent image."""
    char_id = task.get("character_id")
    if not char_id:
        return task

    # Tier 1: series character
    char_png = book_paths["out_character"] / f"character_{char_id}.png"
    if char_png.exists():
        return {
            **task,
            "prompt": _ANCHOR_HEADER + task["prompt"],
            "ref_paths": [char_png] + list(task.get("ref_paths") or []),
        }

    # Tier 2: sibling anchor (chained i2i)
    out_anchors = book_paths.get("out_anchors")
    self_path = task.get("out_path")
    if out_anchors and out_anchors.exists():
        siblings = sorted(
            p for p in out_anchors.glob(f"{char_id}_*.png")
            if p != self_path
        )
        if siblings:
            ref = siblings[0]
            print(f"  ↺ anchor {task.get('label')}: chaining i2i ref to "
                  f"sibling {ref.name} (no series PNG)", flush=True)
            return {
                **task,
                "prompt": _ANCHOR_HEADER + task["prompt"],
                "ref_paths": [ref] + list(task.get("ref_paths") or []),
            }

    # Tier 3: text-to-image
    print(f"  ! anchor {task.get('label')}: no series portrait at "
          f"{char_png.name} and no sibling anchor, running prompt-only "
          f"(face free-rendered, flag for reviewer)", flush=True)
    return task


def _build_scene_grid_tasks(
    tasks_output: dict,
    book_paths: dict[str, pathlib.Path],
    style_table: dict[str, dict] | None = None,
    static_refs: dict[str, list[tuple[bytes, str]]] | None = None,
    only_filter: set[str] | None = None,
) -> list[dict]:
    """Layer B: NEW task type — scene grid panels. Reads tasks_output.scene_tasks
    where item.has_sub_locations is True; emits one task per parent location.
    out_path = series/scene_<location_id>_grid.png."""
    if style_table is None:
        style_table = {}
    if static_refs is None:
        static_refs = {}
    style = style_table.get(SCENE_GRID_CATEGORY) or style_table.get(SCENE_SERIES_CATEGORY)
    refs = static_refs.get(SCENE_GRID_CATEGORY) or static_refs.get(SCENE_SERIES_CATEGORY) or []
    out: list[dict] = []
    for task in tasks_output.get("scene_tasks") or []:
        if not task.get("has_sub_locations"):
            continue
        loc_id = task.get("location_id") or task.get("id")
        if not loc_id:
            continue
        # 2026-05-08: prefer team's YA_Impasto_grid template + rebuild from
        # upstream extracted bits (grid_size + grid_cells). Drops 06's
        # 'Korean manhwa + cinematic lighting' head that conflicts with
        # YA Impasto ref. See rebuild_grid_prompt docstring.
        grid_spec = task.get("grid")
        if isinstance(grid_spec, dict) and grid_spec.get("prompt") and style:
            prompt = rebuild_grid_prompt(grid_spec["prompt"], style["prompt"])
            # FORCE style["model"] (image-gpt) over upstream spec model.
            # Upstream tasks_output.json hardcodes 'nano-banana-pro' which
            # routes to genai/Zenmux and 403s (no permission). Same fix as
            # _build_outfit_anchor_tasks.
            model = style["model"]
        elif style is not None:
            scene_text = task.get("location_name") or loc_id
            prompt = render_prompt(style["prompt"], scene_text)
            model = style["model"]
        else:
            # No way to render — skip this entry.
            continue
        label = f"grid:{loc_id}"
        if not _filter_label(label, only_filter):
            continue
        out.append({
            "label": label,
            "category": SCENE_GRID_CATEGORY,
            "model": model,
            "prompt": prompt,
            "static_refs": refs,
            "ref_paths": [],
            "out_path": book_paths["out_series"] / f"scene_{loc_id}_grid.png",
            "parent_location_id": loc_id,
        })
    return out


def _build_scene_square_tasks_template(
    tasks_output: dict,
    book_paths: dict[str, pathlib.Path],
    style_table: dict[str, dict] | None = None,
    static_refs: dict[str, list[tuple[bytes, str]]] | None = None,
    only_filter: set[str] | None = None,
) -> list[dict]:
    """Layer C template: scene_square per location. ref_paths populated later
    by _bind_grid_reference (only when reference_image_source = dynamic_grid_*)."""
    if style_table is None:
        style_table = {}
    if static_refs is None:
        static_refs = {}
    style = style_table.get(SCENE_SERIES_CATEGORY)
    refs = static_refs.get(SCENE_SERIES_CATEGORY, [])
    out: list[dict] = []

    scene_tasks = tasks_output.get("scene_tasks") or []
    if scene_tasks:
        # Rich tasks_output schema (n2m).
        for task in scene_tasks:
            parent_id = task.get("location_id") or task.get("id")
            for scene in task.get("scenes") or []:
                scene_id = scene.get("scene_id") or scene.get("id")
                if not scene_id:
                    continue
                # 2026-05-08: prefer backend-constructed YA Impasto inline
                # template + sub_location_name from upstream. 06's prompt
                # mixes Korean manhwa + cinematic vocab that contradicts
                # the YA Impasto ref pulled in by _bind_grid_reference.
                # See build_scene_square_prompt docstring.
                sub_loc = scene.get("sub_location_name")
                if sub_loc:
                    prompt = build_scene_square_prompt(sub_loc)
                else:
                    # No sub_location_name → fall back to upstream prompt /
                    # template fill (legacy path for non-NRBI books).
                    prompt = scene.get("prompt") or (
                        render_prompt(style["prompt"], scene_id) if style else None
                    )
                if prompt is None:
                    continue
                # FORCE style["model"] (image-gpt) over upstream spec model.
                # Upstream tasks_output.json hardcodes 'nano-banana-pro' which
                # routes to genai/Zenmux and 403s. Same fix as grid + anchor.
                model = (style["model"] if style else None) or scene.get("model") or ""
                ref_source = scene.get("reference_image_source", "none")
                label = f"scene:{scene_id}"
                if not _filter_label(label, only_filter):
                    continue
                out.append({
                    "label": label,
                    "category": SCENE_SERIES_CATEGORY,
                    "model": model,
                    "prompt": prompt,
                    "static_refs": refs,
                    "ref_paths": [],
                    "out_path": book_paths["out_scene"] / f"scene_{scene_id}.png",
                    "parent_location_id": parent_id,
                    "reference_image_source": ref_source,
                })
        return out

    # Legacy hardcoded EP1_SCENES path (no tasks_output schema available).
    if style is None:
        return out
    for sid, scene_text in EP1_SCENES.items():
        prompt = render_prompt(style["prompt"], scene_text)
        label = f"scene:{sid}"
        if not _filter_label(label, only_filter):
            continue
        out.append({
            "label": label,
            "category": SCENE_SERIES_CATEGORY,
            "model": style["model"],
            "prompt": prompt,
            "static_refs": refs,
            "ref_paths": [],
            "out_path": book_paths["out_scene"] / f"scene_{sid}.png",
            "parent_location_id": None,
            "reference_image_source": "none",
        })
    return out


def _build_scene_variant_tasks_template(
    tasks_output: dict,
    book_paths: dict[str, pathlib.Path],
    style_table: dict[str, dict] | None = None,
    static_refs: dict[str, list[tuple[bytes, str]]] | None = None,
    only_filter: set[str] | None = None,
) -> list[dict]:
    """Layer D template: per-EP scene variants. ref_paths bound from corresponding
    base scene square."""
    if style_table is None:
        style_table = {}
    if static_refs is None:
        static_refs = {}
    style = style_table.get(SCENE_SERIES_CATEGORY)
    refs = static_refs.get(SCENE_SERIES_CATEGORY, [])
    out: list[dict] = []
    for variant in tasks_output.get("scene_variants") or []:
        variant_id = variant.get("variant_id") or variant.get("id")
        base_id = variant.get("base_scene_id")
        if not (variant_id and base_id):
            continue
        prompt = variant.get("prompt") or (
            render_prompt(style["prompt"], variant_id) if style else None
        )
        if prompt is None:
            continue
        # FORCE style["model"] (image-gpt) over upstream spec model.
        # Same nano-banana-pro routing fix as grid/square/anchor.
        model = (style["model"] if style else None) or variant.get("model") or ""
        label = f"variant:{variant_id}"
        if not _filter_label(label, only_filter):
            continue
        out.append({
            "label": label,
            "category": SCENE_SERIES_CATEGORY,
            "model": model,
            "prompt": prompt,
            "static_refs": refs,
            "ref_paths": [],
            "out_path": book_paths["out_scene"] / f"scene_{variant_id}.png",
            "baseline_scene_id": base_id,
        })
    return out


def _build_ep_sprite_tasks_template(
    tasks_output: dict,
    book_paths: dict[str, pathlib.Path],
    style_table: dict[str, dict] | None = None,
    static_refs: dict[str, list[tuple[bytes, str]]] | None = None,
    only_filter: set[str] | None = None,
) -> list[dict]:
    """Layer E template: per-EP sprites. ref_paths bound from series character."""
    if style_table is None:
        style_table = {}
    if static_refs is None:
        static_refs = {}
    style = style_table.get(CHAR_EP_CATEGORY)
    extra_refs = static_refs.get(CHAR_EP_CATEGORY, [])
    if style is None:
        return []
    out: list[dict] = []
    sprites_root = tasks_output.get("ep_character_sprites") or {}
    for _ep_key, char_map in sprites_root.items():
        # Single-ep scope (ep1): book_paths["out_sprites"] already resolves to
        # ep_sprites/ep1/. Multi-ep dispatch is deferred (YAGNI).
        ep_dir = book_paths["out_sprites"]
        for char_id, char_spec in (char_map or {}).items():
            if not isinstance(char_spec, dict):
                continue
            for sprite in char_spec.get("sprites") or []:
                sprite_id = sprite.get("sprite_id") or sprite.get("id")
                if not sprite_id:
                    continue
                # Allow upstream-supplied prompt (n2m); otherwise fall back to
                # the legacy build_sprite_text path used by EP1_CHARS flow.
                if sprite.get("prompt"):
                    # 2026-05-08: align chromakey hex with Layer A + cutout.py.
                    base_text = clean_sprite_prompt(sprite["prompt"])
                else:
                    base_text = build_sprite_text(sprite.get("orig_prompt", ""))
                # 2026-05-07: bypass style template wrapping for anchor-locked
                # sprites. n2m's commit 1843f98 (rewrite 6402 sprite prompts to
                # anchor-locked template) made every sprite['prompt'] a
                # self-contained i2i prompt: "参考图 1 是该角色在该套服装下的
                # anchor 立绘 + 硬锁 face/outfit + 仅改神态+姿态 + chromakey".
                # The style.update_character template ("仅编辑人物做着装、
                # 神态和姿态的改动") was written for the legacy series-portrait
                # ref flow and tells the model to CHANGE outfit, contradicting
                # the anchor lock. Same handling as Layer A.5 anchors (line
                # 635, "prompt": prompt) and the n2m _deprecated/asset-renderer
                # /generate.py pipeline (passes spec['prompt'] unchanged).
                # legacy build_sprite_text fallback (no upstream prompt) still
                # uses the template since it's a paragraph fragment, not a
                # complete prompt.
                if sprite.get("prompt"):
                    prompt = base_text
                else:
                    prompt = render_prompt(style["prompt"], base_text) if style.get("prompt") else base_text
                # Sprite model dispatch — aligned with anchor/scene/series paths
                # (lines 942/1011/1079) that all prefer `style["model"]` over the
                # task-side field. The legacy `tasks_output.json` carries
                # `"model": "nano-banana-pro"` on every sprite from the old n2m
                # pipeline; routing it through here caused 740 sprites to 403
                # against mob-ai when only `image-gpt` was authorised on the
                # account (2026-05-11 incident). The `--sprite-model` CLI flag
                # (env: __SPRITE_MODEL_OVERRIDE__) still wins for explicit
                # overrides like `z-image-turbo`.
                model = (
                    os.environ.get("__SPRITE_MODEL_OVERRIDE__")
                    or style["model"]
                    or sprite.get("model")
                )
                label = f"sprite:{sprite_id}"
                if not _filter_label(label, only_filter):
                    continue
                out.append({
                    "label": label,
                    "category": CHAR_EP_CATEGORY,
                    "model": model,
                    "prompt": prompt,
                    "static_refs": list(extra_refs),
                    "ref_paths": [],
                    "out_path": ep_dir / f"{sprite_id}.png",
                    "character_id": char_id,
                    "outfit_id": sprite.get("outfit_id"),  # NEW: for Layer A.5 anchor binding
                })
    return out


def _bind_grid_reference(task: dict, book_paths: dict[str, pathlib.Path]) -> dict:
    """Inject the parent location's grid PNG path into task['ref_paths']
    when the upstream spec asked for dynamic_grid_panel/dynamic_grid_step1.
    Returns a NEW dict (immutable update)."""
    parent_id = task.get("parent_location_id")
    ref_source = task.get("reference_image_source", "none")
    if not parent_id or ref_source not in ("dynamic_grid_panel", "dynamic_grid_step1"):
        return task
    grid_png = book_paths["out_series"] / f"scene_{parent_id}_grid.png"
    return {**task, "ref_paths": [grid_png] + list(task.get("ref_paths") or [])}


def _bind_square_reference(task: dict, book_paths: dict[str, pathlib.Path]) -> dict:
    """Inject the baseline scene PNG path for a variant task."""
    base_id = task.get("baseline_scene_id")
    if not base_id:
        return task
    base_png = book_paths["out_scene"] / f"scene_{base_id}.png"
    return {**task, "ref_paths": [base_png] + list(task.get("ref_paths") or [])}


def _bind_series_character_reference(task: dict, book_paths: dict[str, pathlib.Path]) -> dict:
    """Inject the series character PNG path as the first reference for a sprite."""
    char_id = task.get("character_id")
    if not char_id:
        return task
    char_png = book_paths["out_character"] / f"character_{char_id}.png"
    return {**task, "ref_paths": [char_png] + list(task.get("ref_paths") or [])}


def _bind_outfit_anchor_reference(task: dict, book_paths: dict[str, pathlib.Path]) -> dict:
    """Layer E binding: use anchor/<char>_<outfit>.png as i2i ref.

    HARD CONTRACT (2026-05-12, NRBI Phase C):
    Anchors are the only acceptable identity+outfit reference. If a sprite's
    anchor is missing, FAIL LOUD — no silent fallback to series character.
    Fallback would lose outfit lock and silently degrade quality; that's
    not acceptable for production renders.

    Pre-flight should verify all required anchors exist before invoking
    the renderer; this is the runtime safety net.
    """
    char_id = task.get("character_id")
    outfit_id = task.get("outfit_id")
    if not char_id:
        raise ValueError(
            f"sprite task missing character_id: label={task.get('label')!r}"
        )
    if not outfit_id:
        raise ValueError(
            f"sprite task missing outfit_id (no anchor binding possible): "
            f"label={task.get('label')!r} char={char_id}"
        )
    anchor_png = book_paths["out_anchors"] / f"{char_id}_{outfit_id}.png"
    if not anchor_png.exists():
        raise FileNotFoundError(
            f"sprite {task.get('label')!r}: anchor i2i reference missing "
            f"{anchor_png} — refusing to fall back. Render the missing "
            f"anchor first or fix the outfit_id mapping."
        )
    return {**task, "ref_paths": [anchor_png] + list(task.get("ref_paths") or [])}


def _load_dynamic_refs(paths: list[pathlib.Path]) -> list[tuple[bytes, str]]:
    out: list[tuple[bytes, str]] = []
    for p in paths:
        if not p.exists():
            print(f"  ! missing dynamic ref: {p.name}", flush=True)
            continue
        suffix = p.suffix.lower()
        mime = "image/png"
        if suffix in (".jpg", ".jpeg"):
            mime = "image/jpeg"
        elif suffix == ".webp":
            mime = "image/webp"
        out.append((p.read_bytes(), mime))
    return out


def _run_render_task(task: dict, client, overwrite: bool) -> tuple[str, str, str]:
    """Resolve refs, call image model, save PNG. Reuses render_with_retry.

    Skip-when-exists is delegated to render_with_retry — keep this wrapper
    free of duplicate gating so behaviour stays in one place.
    """
    label = task["label"]
    dynamic_refs = _load_dynamic_refs(task.get("ref_paths") or [])
    static_refs = list(task.get("static_refs") or [])
    refs = dynamic_refs + static_refs
    status, detail = render_with_retry(
        client, task["model"], task["prompt"], refs, task["out_path"], overwrite,
        category=task.get("category"),
    )
    return (label, status, detail)


def render_in_layers(
    style_table: dict[str, dict],
    book_paths: dict[str, pathlib.Path],
    tasks_output: dict,
    overwrite: bool,
    only_filter: set[str] | None,
    static_refs: dict[str, list[tuple[bytes, str]]] | None = None,
    client=None,
) -> dict[str, tuple[str, str]]:
    """6-layer DAG render. Within each layer, up to LAYER_CONCURRENCY concurrent renders.

    Layer A:   series characters       (no deps)
    Layer A.5a: outfit anchors phase 1 (depends on A; chars w/ series PNG run all
                                        outfits here; chars w/o series PNG run
                                        their first outfit text-to-image)
    Layer A.5b: outfit anchors phase 2 (depends on A.5a; chained-i2i secondary
                                        anchors for chars w/o series PNG, ref =
                                        sibling primary anchor from A.5a)
    Layer B:   scene grid panels       (no deps)
    Layer C:   scene square per loc    (depends on B grid PNG)
    Layer D:   scene variant per ep    (depends on C square)
    Layer E:   ep sprites              (depends on A.5 anchor PNG; falls back to A
                                        series character when an anchor is missing)

    A + B run together; A.5a starts once A drains; A.5b starts once A.5a drains;
    C waits for B; D waits for C; E waits for A.5b. A.5a + C can run concurrently.
    """
    if static_refs is None:
        static_refs = {}
    results: dict[str, tuple[str, str]] = {}

    layer_a = _build_series_character_tasks(tasks_output, book_paths, style_table, static_refs, only_filter)
    layer_a5 = _build_outfit_anchor_tasks(book_paths, style_table, only_filter)
    layer_b = _build_scene_grid_tasks(tasks_output, book_paths, style_table, static_refs, only_filter)
    layer_c_template = _build_scene_square_tasks_template(tasks_output, book_paths, style_table, static_refs, only_filter)
    layer_d_template = _build_scene_variant_tasks_template(tasks_output, book_paths, style_table, static_refs, only_filter)
    layer_e_template = _build_ep_sprite_tasks_template(tasks_output, book_paths, style_table, static_refs, only_filter)

    # A.5 split preview
    _has_series = set(tasks_output.get("series_character_prompts") or {})
    _by_char_preview: dict[str, list] = {}
    for t in layer_a5:
        _by_char_preview.setdefault(t["character_id"], []).append(t)
    _a5a_count = sum(
        len(ts) if c in _has_series else 1
        for c, ts in _by_char_preview.items()
    )
    _a5b_count = sum(
        max(0, len(ts) - 1) if c not in _has_series else 0
        for c, ts in _by_char_preview.items()
    )
    print(
        f"DAG: A={len(layer_a)} A.5a={_a5a_count} A.5b={_a5b_count} "
        f"B={len(layer_b)} C={len(layer_c_template)} D={len(layer_d_template)} "
        f"E={len(layer_e_template)}"
    )

    if client is None:
        # No client → return shape only (used by tests).
        return results

    def _drain(futures: list, label: str) -> None:
        for f in cf.as_completed(futures):
            lbl, status, detail = f.result()
            results[lbl] = (status, detail)
            tag = {"ok": "✓", "skip": "·", "fail": "✗"}.get(status, "?")
            print(f"  {tag} {lbl}: {detail[:200]}", flush=True)
        print(f"✓ Layer {label} done", flush=True)

    # Layers A + B run together (no inter-deps).
    with cf.ThreadPoolExecutor(max_workers=LAYER_CONCURRENCY) as pool:
        ab_futures = [pool.submit(_run_render_task, t, client, overwrite)
                      for t in (layer_a + layer_b)]
        _drain(ab_futures, "A+B")

    # Layer A.5: needs series character PNGs in place; bind series portrait now.
    # Split into two phases for chained-i2i support:
    #   A.5a (primary)  — chars with series PNG + first-outfit-of chars without
    #   A.5b (secondary) — remaining outfits of chars without series PNG, refs
    #                      a sibling anchor produced by A.5a.
    # Most chars (those with series PNG) flow entirely through A.5a; A.5b is
    # only used for the chained chars (NRBI: brielle, tatiana, ximena → 4 tasks).
    has_series_png = set(tasks_output.get("series_character_prompts") or {})
    a5_by_char: dict[str, list[dict]] = {}
    for t in layer_a5:
        a5_by_char.setdefault(t["character_id"], []).append(t)
    layer_a5a: list[dict] = []
    layer_a5b: list[dict] = []
    for char_id, tasks in a5_by_char.items():
        if char_id in has_series_png:
            # Has Layer A ref → all outfits run independently in A.5a.
            layer_a5a.extend(tasks)
        else:
            # No series PNG → first outfit (alphabetical) is primary (text-to-image),
            # others chain off the primary in A.5b.
            tasks_sorted = sorted(tasks, key=lambda t: t["outfit_id"])
            layer_a5a.append(tasks_sorted[0])
            layer_a5b.extend(tasks_sorted[1:])

    layer_a5a_bound = [_bind_series_portrait_for_anchor(t, book_paths) for t in layer_a5a]
    with cf.ThreadPoolExecutor(max_workers=LAYER_CONCURRENCY) as pool:
        a5a_futures = [pool.submit(_run_render_task, t, client, overwrite) for t in layer_a5a_bound]
        _drain(a5a_futures, "A.5a")

    if layer_a5b:
        # A.5a has populated out_anchors/<char>_*.png — now bind sibling refs.
        layer_a5b_bound = [_bind_series_portrait_for_anchor(t, book_paths) for t in layer_a5b]
        with cf.ThreadPoolExecutor(max_workers=LAYER_CONCURRENCY) as pool:
            a5b_futures = [pool.submit(_run_render_task, t, client, overwrite) for t in layer_a5b_bound]
            _drain(a5b_futures, "A.5b")

    # Layer C: needs grid PNGs in place; bind references now.
    layer_c = [_bind_grid_reference(t, book_paths) for t in layer_c_template]
    with cf.ThreadPoolExecutor(max_workers=LAYER_CONCURRENCY) as pool:
        c_futures = [pool.submit(_run_render_task, t, client, overwrite) for t in layer_c]
        _drain(c_futures, "C")

    # Layer D: needs square PNGs in place.
    layer_d = [_bind_square_reference(t, book_paths) for t in layer_d_template]
    with cf.ThreadPoolExecutor(max_workers=LAYER_CONCURRENCY) as pool:
        d_futures = [pool.submit(_run_render_task, t, client, overwrite) for t in layer_d]
        _drain(d_futures, "D")

    # Layer E: needs A.5 anchor PNGs in place (falls back to A series char if missing).
    layer_e = [_bind_outfit_anchor_reference(t, book_paths) for t in layer_e_template]
    with cf.ThreadPoolExecutor(max_workers=LAYER_CONCURRENCY) as pool:
        e_futures = [pool.submit(_run_render_task, t, client, overwrite) for t in layer_e]
        _drain(e_futures, "E")

    return results


# ─── main ──────────────────────────────────────────────────────────────

def main() -> int:
    global _CURRENT_STYLE_FAMILY

    ap = argparse.ArgumentParser(prog="render-with-style")
    ap.add_argument("--book-slug", default=DEFAULT_BOOK_SLUG, help="moonscripts/<slug>/ folder name")
    ap.add_argument("--only", help="comma list of labels to render, e.g. 'char:selena,scene:school_hallway'")
    ap.add_argument("--overwrite", action="store_true")
    # NEW: local style cache (skip SSH+PG). Default to ./_style_cache/styles.json if present.
    _default_cache = pathlib.Path(__file__).resolve().parent / "_style_cache" / "styles.json"
    ap.add_argument("--style-cache",
                    default=str(_default_cache) if _default_cache.exists() else None,
                    help="Path to local styles JSON dump (skip SSH+PG). Auto-uses ./_style_cache/styles.json if present.")
    # NEW: pin a style family (e.g. 'YA_Impasto') from the cache
    ap.add_argument("--style-family", default=None,
                    help="Filter cached styles by name prefix (e.g. 'YA_Impasto'). Affects prompt rewriting too.")
    # NEW: override the model used for ep_sprite layer (e.g. 'z-image-turbo' for cheap i2i)
    ap.add_argument("--sprite-model", default=None,
                    help="Override Layer 5 sprite model (e.g. 'z-image-turbo'). Default: style row's model.")
    # NEW: env file for OSS / WAVESPEED secrets
    ap.add_argument("--env-file", default=str(pathlib.Path(__file__).resolve().parent.parent / ".env"),
                    help="Path to .env file with OSS_* / WAVESPEED_API_KEY (default: backend/.env)")
    ap.add_argument("--input", type=pathlib.Path, default=None,
                    help="Override tasks_output.json with a render_todo.json "
                         "(Layer C cross_check.py output). When set, only the "
                         "subset of plan in this file gets rendered.")
    args = ap.parse_args()

    # Load .env so OSS_* + WAVESPEED_API_KEY are available to render_z_image_turbo
    env_path = pathlib.Path(args.env_file)
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

    # Pass --sprite-model to _build_ep_sprite_tasks_template via env var (avoids
    # threading another arg through 5 function signatures).
    if args.sprite_model:
        os.environ["__SPRITE_MODEL_OVERRIDE__"] = args.sprite_model
        print(f"[render-with-style] sprite model override: {args.sprite_model}")

    P = book_paths(args.book_slug)
    if not P["book_dir"].is_dir():
        sys.exit(f"book dir not found: {P['book_dir']}")
    input_path = args.input or P["tasks_file"]
    if not input_path.exists():
        sys.exit(f"render input not found: {input_path}")
    print(f"[render-with-style] input: {input_path.name}")

    if args.style_cache:
        cache_path = pathlib.Path(args.style_cache)
        print(f"[render-with-style] loading styles from local cache: {cache_path}")
        styles = load_styles_from_cache(cache_path, style_name_filter=args.style_family)
        if args.style_family:
            print(f"  style family filter: {args.style_family}")
            _CURRENT_STYLE_FAMILY = args.style_family
    else:
        print("[render-with-style] loading styles from remote PG…")
        styles = load_styles()
    miss = [c for c in (CHAR_SERIES_CATEGORY, SCENE_SERIES_CATEGORY) if c not in styles]
    if miss:
        sys.exit(f"missing styles in DB: {miss}")
    char_style = styles[CHAR_SERIES_CATEGORY]
    scene_style = styles[SCENE_SERIES_CATEGORY]
    grid_style = styles.get(SCENE_GRID_CATEGORY)
    ep_style = styles.get(CHAR_EP_CATEGORY)  # optional
    print(f"  character style: {char_style['name']!r}  model={char_style['model']}  refs={len(char_style.get('reference_urls') or [])}")
    print(f"  scene style:     {scene_style['name']!r}  model={scene_style['model']}  refs={len(scene_style.get('reference_urls') or [])}")
    if grid_style:
        print(f"  scene grid style: {grid_style['name']!r}  model={grid_style['model']}  refs={len(grid_style.get('reference_urls') or [])}")
    else:
        print("  scene grid style: (not in DB; falling back to scene series style for grid prompts)")
    if ep_style:
        print(f"  ep sprite style: {ep_style['name']!r}  model={ep_style['model']}  refs={len(ep_style.get('reference_urls') or [])}")

    print("[render-with-style] fetching reference images…")
    static_refs: dict[str, list[tuple[bytes, str]]] = {
        CHAR_SERIES_CATEGORY: [fetch_url(u) for u in (char_style.get("reference_urls") or [])],
        SCENE_SERIES_CATEGORY: [fetch_url(u) for u in (scene_style.get("reference_urls") or [])],
    }
    if grid_style:
        static_refs[SCENE_GRID_CATEGORY] = [fetch_url(u) for u in (grid_style.get("reference_urls") or [])]
    if ep_style:
        static_refs[CHAR_EP_CATEGORY] = [fetch_url(u) for u in (ep_style.get("reference_urls") or [])]

    client = genai.Client(
        api_key=kc("ZENMUX_API_KEY"),
        vertexai=True,
        http_options=gt.HttpOptions(api_version="v1", base_url=ZENMUX_BASE_URL),
    )

    tasks_data = json.loads(input_path.read_text())
    only_filter: set[str] | None = None
    if args.only:
        only_filter = {s.strip() for s in args.only.split(",") if s.strip()}

    print(f"[render-with-style] DAG render (per-layer concurrency={LAYER_CONCURRENCY})  overwrite={args.overwrite}")
    results = render_in_layers(
        style_table=styles,
        book_paths=P,
        tasks_output=tasks_data,
        overwrite=args.overwrite,
        only_filter=only_filter,
        static_refs=static_refs,
        client=client,
    )

    if not results:
        print("no jobs ran (possibly all skipped or empty --only filter)")
        # Do not fail here — empty result with no filter is unusual but not a hard error.
    ok = sum(1 for s, _ in results.values() if s == "ok")
    skip = sum(1 for s, _ in results.values() if s == "skip")
    fail = sum(1 for s, _ in results.values() if s == "fail")
    print(f"\nDone. ok={ok} skip={skip} fail={fail}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
