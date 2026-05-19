"""Tests for apply_rename.py."""
from __future__ import annotations

import re

import pytest

from apply_rename import build_replacement_pairs, ReplacementPair


def test_builds_full_name_pair():
    rename_map = {
        "characters": {
            "alice": {
                "new_id": "nova",
                "new_full_name": "Nova Celeste Vega",
                "alias_mapping": {},
            },
        },
        "locations": {},
        "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice Marie Hart", "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(
        p.kind == "full_name"
        and p.pattern.pattern == r"(?<![A-Za-z])Alice\ Marie\ Hart(?![A-Za-z])"
        and p.replacement == "Nova Celeste Vega"
        for p in pairs
    )


def test_builds_given_name_pair():
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova Vega",
                                  "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice Hart", "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(p.kind == "given_name" and p.replacement == "Nova" for p in pairs)


def test_builds_surname_pair():
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova Vega",
                                  "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice Hart", "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(p.kind == "surname" and p.replacement == "Vega" for p in pairs)


def test_alias_keep_produces_no_pair():
    """When alias maps to itself (KEEP), no pair is generated."""
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova",
                                  "alias_mapping": {"Sparrow": "Sparrow"}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice", "aliases": ["Sparrow"]}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert not any(p.kind == "alias" and p.replacement == "Sparrow" for p in pairs)


def test_alias_changed_produces_pair():
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova",
                                  "alias_mapping": {"Ally": "Novy"}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice", "aliases": ["Ally"]}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(p.kind == "alias" and p.replacement == "Novy" for p in pairs)


def test_drop_alias_uses_new_given_name():
    """Null alias (DROP) replaces with new_full_name's first token."""
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova Celeste Vega",
                                  "alias_mapping": {"Heart": None}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice", "aliases": ["Heart"]}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(p.kind == "drop_alias" and p.replacement == "Nova" for p in pairs)


def test_speaker_label_pair():
    """Uppercase character ID in prose should be rewritten (prose emphasis + MSS speaker labels)."""
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova",
                                  "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice", "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(p.kind == "speaker_label" and p.replacement == "NOVA" for p in pairs)


def test_mss_token_pair():
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova",
                                  "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice", "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(p.kind == "mss_token" and p.replacement == "@nova" for p in pairs)


def test_builds_id_lower_pair():
    """Bare lowercase old_id (compound tokens like 'alice-self-accept',
    bible-file mentions) must be replaced with lowercase new_id.
    """
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova",
                                  "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice", "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    assert any(p.kind == "id_lower" and p.replacement == "nova" for p in pairs)


def test_id_lower_replaces_in_flavor_code():
    from apply_rename import apply_to_text

    pairs = [ReplacementPair(re.compile(r"\balice\b"), "nova", "id_lower")]
    assert apply_to_text("ending: alice-self-accept", pairs) == (
        "ending: nova-self-accept"
    )


def test_id_lower_replaces_filename_reference():
    from apply_rename import apply_to_text

    pairs = [ReplacementPair(re.compile(r"\balice\b"), "nova", "id_lower")]
    assert apply_to_text("see `mc-bible-alice.md`", pairs) == (
        "see `mc-bible-nova.md`"
    )


def test_id_lower_does_not_match_inside_words():
    """Word boundaries protect against matching ``alice`` in ``malice``
    or ``palace``."""
    from apply_rename import apply_to_text

    pairs = [ReplacementPair(re.compile(r"\balice\b"), "nova", "id_lower")]
    assert apply_to_text("malice palace", pairs) == "malice palace"


def test_id_lower_matches_underscore_wrapped_token():
    """Asset tokens like ``theme_alice_morning`` must be renamed.

    Word-boundary ``\\b`` fails here because ``_`` is a word char in
    regex, so the pair must use a strict non-letter boundary instead.
    """
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova",
                                  "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice", "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    from apply_rename import apply_to_text

    assert apply_to_text("@music play theme_alice_morning", pairs) == (
        "@music play theme_nova_morning"
    )


def test_prompts_json_renames_nested_char_id_keys():
    """06/tasks_output.json has deeply nested dicts keyed by character ID
    (e.g., ep_character_sprites.ep1.malia). All such keys must be renamed,
    not just the top-level series_character_prompts.
    """
    from apply_rename import _apply_to_prompts_json

    rename_map = {
        "characters": {
            "alice": {"new_id": "nova", "new_full_name": "Nova",
                      "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    pairs: list = []  # no text pairs needed for key-only renames
    data = {
        "ep_character_sprites": {
            "ep1": {"alice": {"outfit": "jeans"}},
            "ep2": {"alice": {"outfit": "dress"}},
        },
        "sprite_id_mapping": {"alice_neutral": "alice-neutral.png"},
    }
    result = _apply_to_prompts_json(data, rename_map, pairs)
    assert "nova" in result["ep_character_sprites"]["ep1"]
    assert "alice" not in result["ep_character_sprites"]["ep1"]
    assert "nova" in result["ep_character_sprites"]["ep2"]


def test_surname_lower_in_asset_tokens():
    """Asset tokens like 'theme_hernandez_home_warm' must rename the
    lowercased surname. surname pair is Title-case only; a surname_lower
    pair picks up the asset-token form.
    """
    rename_map = {
        "characters": {"alice": {"new_id": "nova",
                                  "new_full_name": "Nova Hart Vega",
                                  "alias_mapping": {}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice Marie Hart",
                                   "aliases": []}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    from apply_rename import apply_to_text

    assert apply_to_text("@music play theme_hart_home_warm", pairs) == (
        "@music play theme_vega_home_warm"
    )


def test_alias_lower_in_asset_tokens():
    """Lowercase alias also catches asset-token compound usage."""
    rename_map = {
        "characters": {"alice": {"new_id": "nova", "new_full_name": "Nova",
                                  "alias_mapping": {"Sparrow": "Phoenix"}}},
        "locations": {}, "free_tokens": {},
    }
    normalizer_chars = {"alice": {"full_name": "Alice",
                                   "aliases": ["Sparrow"]}}
    pairs = build_replacement_pairs(rename_map, normalizer_chars, {})
    from apply_rename import apply_to_text

    assert apply_to_text("theme_sparrow_night", pairs) == (
        "theme_phoenix_night"
    )


def test_free_token_case_insensitive_for_asset_names():
    """free_tokens entry like 'Morhills' should also rename lowercase
    asset-token usage like 'theme_morhills_halls'."""
    rename_map = {
        "characters": {}, "locations": {},
        "free_tokens": {"Morhills": "Westbluff"},
    }
    pairs = build_replacement_pairs(rename_map, {}, {})
    from apply_rename import apply_to_text

    text = "Morhills Academy / theme_morhills_halls"
    assert apply_to_text(text, pairs) == (
        "Westbluff Academy / theme_westbluff_halls"
    )


def test_transform_locations_rewrites_sub_location_desc():
    """sub_location desc strings (user-facing labels like 'Alice's bedroom')
    must be passed through apply_to_text so embedded names are renamed.
    """
    import re as _re

    from apply_rename import apply_to_json

    rename_map = {
        "characters": {
            "alice": {"new_id": "nova", "new_full_name": "Nova Vega",
                      "alias_mapping": {}},
        },
        "locations": {
            "alice_house": {
                "new_id": "nova_house",
                "new_full_name": "Vega home",
                "sub_location_ids": {
                    "alice_house_bedroom": "nova_house_bedroom",
                },
                "alias_mapping": {},
            },
        },
        "free_tokens": {},
    }
    data = {"locations": {"alice_house": {
        "full_name": "Hart home",
        "sub_locations": {"alice_house_bedroom": "Alice's bedroom"},
        "aliases": [],
    }}}
    pairs = [
        ReplacementPair(_re.compile(r"\bAlice\b", _re.ASCII), "Nova", "given_name"),
    ]
    result = apply_to_json(data, rename_map, pairs, kind="locations")
    sub = result["locations"]["nova_house"]["sub_locations"]
    assert sub["nova_house_bedroom"] == "Nova's bedroom", (
        f"sub_location desc should be text-transformed, got {sub}"
    )


def test_builds_bg_id_pair():
    """Location sub_location_id changes produce a bg_id pair."""
    rename_map = {
        "characters": {},
        "locations": {
            "alice_house": {
                "new_id": "nova_house",
                "new_full_name": "Vega home",
                "sub_location_ids": {"alice_house_kitchen": "nova_house_kitchen"},
                "alias_mapping": {},
            },
        },
        "free_tokens": {},
    }
    normalizer_locs = {
        "alice_house": {
            "full_name": "Hart home",
            "sub_locations": {"alice_house_kitchen": "Kitchen"},
            "aliases": [],
        }
    }
    pairs = build_replacement_pairs(rename_map, {}, normalizer_locs)
    assert any(
        p.kind == "bg_id" and p.replacement == "nova_house_kitchen"
        for p in pairs
    )


def test_bg_id_unchanged_produces_no_pair():
    """Same old/new sub_location_id → no bg_id pair."""
    rename_map = {
        "characters": {},
        "locations": {
            "school": {
                "new_id": "school",
                "new_full_name": "Oakridge",
                "sub_location_ids": {"school_quad": "school_quad"},
                "alias_mapping": {},
            },
        },
        "free_tokens": {},
    }
    normalizer_locs = {
        "school": {
            "full_name": "Willow",
            "sub_locations": {"school_quad": "The quad"},
            "aliases": [],
        }
    }
    pairs = build_replacement_pairs(rename_map, {}, normalizer_locs)
    assert not any(p.kind == "bg_id" for p in pairs)


def test_sort_pairs_longest_first():
    from apply_rename import sort_pairs

    pairs = [
        ReplacementPair(re.compile(r"\bHart\b"), "Vega", "surname"),
        ReplacementPair(
            re.compile(r"\bAlice Marie Hart\b"),
            "Nova Celeste Vega", "full_name",
        ),
        ReplacementPair(re.compile(r"\bAlice\b"), "Nova", "given_name"),
    ]
    sorted_pairs = sort_pairs(pairs)
    assert [p.kind for p in sorted_pairs] == [
        "full_name", "given_name", "surname",
    ]


def test_apply_to_text_prose():
    from apply_rename import apply_to_text

    pairs = [
        ReplacementPair(
            re.compile(r"\bAlice Marie Hart\b"), "Nova Celeste Vega", "full_name",
        ),
        ReplacementPair(re.compile(r"\bAlice\b"), "Nova", "given_name"),
    ]
    text = "Alice Marie Hart went home. Alice was tired."
    assert apply_to_text(text, pairs) == (
        "Nova Celeste Vega went home. Nova was tired."
    )


def test_apply_to_text_speaker():
    from apply_rename import apply_to_text

    pairs = [ReplacementPair(re.compile(r"\bALICE\b"), "NOVA", "speaker_label")]
    assert apply_to_text("ALICE: hi", pairs) == "NOVA: hi"
    assert apply_to_text("ALICE 对 BEN", pairs) == "NOVA 对 BEN"


def test_apply_to_text_mss():
    from apply_rename import apply_to_text

    pairs = [ReplacementPair(re.compile(r"@alice\b"), "@nova", "mss_token")]
    assert apply_to_text("@alice show", pairs) == "@nova show"


def test_apply_to_json_renames_key():
    from apply_rename import apply_to_json

    rename_map = {
        "characters": {
            "alice": {
                "new_id": "nova",
                "new_full_name": "Nova Vega",
                "alias_mapping": {},
            },
        },
        "locations": {},
        "free_tokens": {},
    }
    data = {"characters": {"alice": {"full_name": "Alice Hart", "aliases": ["Ally"]}}}
    pairs = build_replacement_pairs(rename_map, data["characters"], {})
    result = apply_to_json(data, rename_map, pairs, kind="characters")
    assert "nova" in result["characters"]
    assert "alice" not in result["characters"]
    assert result["characters"]["nova"]["full_name"] == "Nova Vega"


def test_apply_to_json_drops_alias():
    from apply_rename import apply_to_json

    rename_map = {
        "characters": {
            "alice": {
                "new_id": "nova",
                "new_full_name": "Nova Vega",
                "alias_mapping": {"Heart": None, "Ally": "Novy"},
            },
        },
        "locations": {},
        "free_tokens": {},
    }
    data = {
        "characters": {
            "alice": {"full_name": "Alice Hart", "aliases": ["Ally", "Heart"]}
        }
    }
    pairs = build_replacement_pairs(rename_map, data["characters"], {})
    result = apply_to_json(data, rename_map, pairs, kind="characters")
    assert "Heart" not in result["characters"]["nova"]["aliases"]
    assert "Novy" in result["characters"]["nova"]["aliases"]


def test_apply_to_project_matches_expected(
    tmp_path, mini_project, rename_map_path, fixtures_root
):
    import json
    import shutil

    from apply_rename import apply_to_project

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    expected = fixtures_root / "expected_after"
    for exp_file in expected.rglob("*"):
        if not exp_file.is_file():
            continue
        rel = exp_file.relative_to(expected)
        actual = work / rel
        assert actual.exists(), f"missing output file: {rel}"
        actual_text = actual.read_text("utf-8").strip()
        expected_text = exp_file.read_text("utf-8").strip()
        assert actual_text == expected_text, (
            f"content mismatch in {rel}:\n"
            f"--- expected ---\n{expected_text}\n"
            f"--- actual ---\n{actual_text}\n"
        )


def test_apply_updates_bible_file_field(tmp_path, mini_project, rename_map_path):
    """characters.json's bible_file value must follow the id rename."""
    import json
    import shutil

    from apply_rename import apply_to_project

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    chars = json.loads(
        (work / "04-entity-normalizer" / "characters.json").read_text("utf-8")
    )
    assert chars["characters"]["nova"]["bible_file"] == "mc-bible-nova.md"
    assert chars["characters"]["reid"]["bible_file"] == "li-bible-reid.md"


def test_apply_renames_bible_files_on_disk(
    tmp_path, mini_project, rename_map_path
):
    """Physical bible files in 02-character-architect/ get renamed."""
    import json
    import shutil

    from apply_rename import apply_to_project

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    bibles = work / "02-character-architect"
    assert (bibles / "mc-bible-nova.md").exists()
    assert not (bibles / "mc-bible-alice.md").exists()
    assert (bibles / "li-bible-reid.md").exists()
    assert not (bibles / "li-bible-ben.md").exists()


def test_apply_creates_backup_and_marker(tmp_path, mini_project, rename_map_path):
    import json
    import shutil

    from apply_rename import apply_to_project

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    marker = work / "04-entity-normalizer" / ".rename_applied"
    assert marker.exists(), "marker file not created"

    backup_root = work / "04.5-entity-rename" / ".backups"
    assert backup_root.exists(), ".backups dir not created"
    backups = list(backup_root.iterdir())
    assert len(backups) == 1, f"expected 1 backup, got {len(backups)}"
    assert (backups[0] / "04-entity-normalizer" / "characters.json").exists(), \
        "backup doesn't contain characters.json"


def test_dry_run_report(tmp_path, mini_project, rename_map_path):
    import json
    import shutil

    from apply_rename import dry_run_report

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    report = dry_run_report(work, rename_map)

    script_entries = [e for e in report["files"] if "ep_1_final.md" in e["path"]]
    assert script_entries, "no ep_1_final.md entry in dry-run report"
    assert script_entries[0]["replacement_count"] > 0, "expected >0 replacements"

    # Dry-run MUST NOT create the marker or backup
    assert not (work / "04-entity-normalizer" / ".rename_applied").exists()
    assert not (work / "04.5-entity-rename").exists()


def test_second_apply_is_noop(tmp_path, mini_project, rename_map_path):
    import json
    import shutil

    from apply_rename import apply_to_project

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)
    result = apply_to_project(work, rename_map)
    assert result == "already_applied"
