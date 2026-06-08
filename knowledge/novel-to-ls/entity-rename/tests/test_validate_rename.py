"""Tests for validate_rename.py."""
from __future__ import annotations

import json
import shutil

import pytest

from apply_rename import apply_to_project
from validate_rename import check_residual, ResidualFound


def test_no_residual_after_clean_apply(tmp_path, mini_project, rename_map_path):
    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)
    check_residual(work, rename_map)  # must not raise


def test_detects_residual_after_injection(tmp_path, mini_project, rename_map_path):
    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)
    ep1 = work / "05-episode-writer" / "scripts" / "ep_1_final.md"
    ep1.write_text(ep1.read_text() + "\nALICE: residual\n")
    with pytest.raises(ResidualFound, match="ALICE"):
        check_residual(work, rename_map)


def test_detects_unknown_ls_token(tmp_path, mini_project, rename_map_path):
    """check_ls_integrity returns a warning list (no longer raises)."""
    from validate_rename import check_ls_integrity

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)
    ep1 = work / "05-episode-writer" / "scripts" / "ep_1_final.md"
    ep1.write_text(ep1.read_text() + "\n@ghost show neutral at center\n")

    problems = check_ls_integrity(work)
    assert any("ghost" in p for p in problems), f"expected @ghost, got {problems}"


def test_ls_integrity_ok(tmp_path, mini_project, rename_map_path):
    """Clean state returns empty list."""
    from validate_rename import check_ls_integrity

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    assert check_ls_integrity(work) == []


def test_ls_integrity_ignores_preexisting_when_backup_given(
    tmp_path, mini_project, rename_map_path
):
    """A pre-existing LS bug (present before apply) is NOT a rename
    regression and must be excluded when a backup_dir is supplied."""
    from validate_rename import check_ls_integrity

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    # Inject pre-existing undefined @jared BEFORE apply so backup captures it.
    ep1 = work / "05-episode-writer" / "scripts" / "ep_1_final.md"
    ep1.write_text(ep1.read_text() + "\n@jared show neutral at center\n", "utf-8")

    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    backups = sorted((work / "04.5-entity-rename" / ".backups").iterdir())
    assert backups, "apply must create a backup"
    backup = backups[-1]

    problems = check_ls_integrity(work, backup_dir=backup)
    assert not any("jared" in p for p in problems), (
        f"pre-existing @jared must not be flagged; got {problems}"
    )


def test_ls_integrity_flags_rename_introduced_problem(
    tmp_path, mini_project, rename_map_path
):
    """A problem that appears only AFTER apply is a real regression and
    must be flagged even when backup_dir is given."""
    from validate_rename import check_ls_integrity

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    # Post-apply, introduce a brand-new undefined token.
    ep1 = work / "05-episode-writer" / "scripts" / "ep_1_final.md"
    ep1.write_text(ep1.read_text() + "\n@brandnew show neutral\n", "utf-8")

    backups = sorted((work / "04.5-entity-rename" / ".backups").iterdir())
    backup = backups[-1]

    problems = check_ls_integrity(work, backup_dir=backup)
    assert any("brandnew" in p for p in problems), (
        f"post-rename regression must be flagged; got {problems}"
    )


def test_ls_integrity_without_backup_reports_all(
    tmp_path, mini_project, rename_map_path
):
    """Without backup_dir, caller gets every problem (can't distinguish)."""
    from validate_rename import check_ls_integrity

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    ep1 = work / "05-episode-writer" / "scripts" / "ep_1_final.md"
    ep1.write_text(ep1.read_text() + "\n@jared show neutral\n", "utf-8")

    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    problems = check_ls_integrity(work)  # no backup_dir
    assert any("jared" in p for p in problems)


def test_check_dead_aliases_warns(tmp_path, mini_project, rename_map_path):
    from validate_rename import check_dead_aliases

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)
    # All new aliases appear in corpus → no warnings expected
    warns = check_dead_aliases(work)
    assert isinstance(warns, list)


def test_check_residual_ignores_non_pipeline_dirs(
    tmp_path, mini_project, rename_map_path
):
    """Phase 01 (source novel) and book-root files are outside rename scope.

    Old tokens (speaker labels, IDs, dropped aliases) appearing there must NOT
    trigger ResidualFound — those files are untouched by apply_rename on
    purpose (source material + book-level docs).
    """
    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    phase01 = work / "01-novel-evaluator"
    phase01.mkdir(parents=True, exist_ok=True)
    # Inject old speaker label + dropped alias into Phase 01 source.
    (phase01 / "novel_excerpt.md").write_text(
        "ALICE: I missed you.\nHeart fluttered again.\n", "utf-8"
    )
    # And into book-root README.
    (work / "README.md").write_text(
        "Heart was Alice's nickname. ALICE appears often.\n", "utf-8"
    )

    # Must not raise — those paths are outside the rename's scope.
    check_residual(work, rename_map)


def test_check_dead_aliases_ignores_non_pipeline_dirs(
    tmp_path, mini_project, rename_map_path
):
    """Dead alias scan must also skip Phase 01 and book-root."""
    from validate_rename import check_dead_aliases

    work = tmp_path / "mini-project"
    shutil.copytree(mini_project, work)
    rename_map = json.loads(rename_map_path.read_text("utf-8"))
    apply_to_project(work, rename_map)

    # Mentioning "Novy" only in Phase 01 should still flag it as dead
    # (because it doesn't appear in 02-06).
    phase01 = work / "01-novel-evaluator"
    phase01.mkdir(parents=True, exist_ok=True)
    (phase01 / "novel.md").write_text("Novy was nicknamed.\n", "utf-8")

    warns = check_dead_aliases(work)
    # "Novy" appears in 05 scripts after rename, so it should NOT be dead
    # regardless of Phase 01 content.
    assert not any("Novy" in w for w in warns if "Novy" == w.split("'")[1]), (
        f"Novy should be live, got warnings: {warns}"
    )
