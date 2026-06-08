#!/usr/bin/env python3
"""
check_narrator_pov.py — LS NARRATOR 2nd-person + @option length validator.

Two hard rules (skills/episode-writer/SKILL.md L38-55, L208-280):
  1. NARRATOR: lines must use uppercase YOU / YOUR / YOURS for MC refs.
     Bad:  NARRATOR: She bats his hand away.
     Good: NARRATOR: YOU bat his hand away.
     Other female chars (Elena, Ximena, Sofia, Camila, Brielle, ...) keep she/her.
  2. @option label text (the quoted "...") must be <= 80 chars (English) /
     <= 30 visible chars (Chinese). Long full-dialogue labels belong inside the
     block as YOU:/SELENA: lines.

Usage:
  # detect only
  python3 check_narrator_pov.py <scripts_dir> [--mc-name Selena] [--fail-on-violation]
  # detect + auto-fix NARRATOR pronouns (option-length is detect-only)
  python3 check_narrator_pov.py <scripts_dir> --fix

Exit codes:
  0  no violations (after fix if --fix)
  1  violations remaining (when --fail-on-violation)
  2  bad arguments / IO error

Design:
  - NARRATOR pronoun check uses a whitelist of "other female chars" and a
    simple subject-tracker: if the most recent named subject in the NARRATOR
    sentence is a whitelisted female name, "she/her" is treated as that
    character. Otherwise the pronoun is flagged as MC ref.
  - MC name ("Selena" by default) anywhere in NARRATOR is always a violation.
  - @option length is measured on the quoted label only, ignoring leading
    @option keywords / brave / safe / ID. Chinese files use a separate
    visible-char limit (since East-Asian glyphs are wider on UI).
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_MC_NAME = "Selena"

# Whitelist of named-and-tracked OTHER female characters in this novel.
# When a NARRATOR sentence's most recent noun-subject is one of these, "she/her"
# in that sentence refers to her — not the MC.
OTHER_FEMALE_CHARS = {
    # Family
    "Elena",      # Diego's mother
    "Ximena",     # MC's mother
    "Xiomara",    # ep1 — clothing scene
    "Sofia",      # ep17 — Diego's grandmother / aunt
    "Selena's mother",
    "MC's mother",
    # Other female cast
    "Camila",     # Weston's ex
    "Brielle",    # Luca-related friend
    "Mariana",    # Weston's sister-figure
    "Lucia",      # ep19 luca scene
    "Priya",
    "Jianna",     # not in nrbi but kept defensively
    "Vikki",
    "Remi",
    # Pronominal hints we treat as "named-ish" subjects
    "Mom",
    "Mama",
    "Mami",
    "Mother",
    "girl",       # narrator describing a depicted girl (drawing) — see ep17 L238
    "waitress",
}

# Lower-cased lookup for fast matching.
OTHER_FEMALE_LOWER = {n.lower() for n in OTHER_FEMALE_CHARS}

# English option label limit.
OPT_LABEL_MAX_EN = 80

# Chinese option label limit (visible width). East-Asian wide chars count as 2.
OPT_LABEL_MAX_ZH_WIDTH = 60

# Pronouns that, in NARRATOR, must be flagged when they refer to MC.
MC_PRONOUNS = {"she", "her", "hers"}

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


@dataclass
class Violation:
    file: str
    line_no: int
    kind: str            # "narrator_mc_ref" | "narrator_mc_name" | "option_too_long"
    snippet: str
    suggestion: str = ""

    def render(self) -> str:
        head = f"{self.file}:{self.line_no} [{self.kind}]"
        body = f"  {self.snippet}"
        tail = f"  -> {self.suggestion}" if self.suggestion else ""
        return "\n".join(p for p in (head, body, tail) if p)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def east_asian_width(s: str) -> int:
    """Visible width treating East-Asian wide chars as 2 columns."""
    return sum(2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1 for ch in s)


PRONOUN_RE = re.compile(r"\b(She|she|Her|her|Hers|hers)\b")
NAME_TOKEN_RE = re.compile(r"\b([A-Z][a-zA-Z]+)\b")

# After "her", these next-tokens indicate object pronoun (not possessive determiner).
# Used to choose YOU vs YOUR when rewriting "her".
HER_OBJECT_FOLLOWERS = {
    "into", "onto", "in", "on", "with", "to", "across", "under", "over",
    "down", "up", "by", "next", "behind", "out", "from", "for", "at",
    "after", "before", "like", "and", "but", "or", "so", "because",
    "until", "while", "when", "where", "as", "than", "though",
    "again", "back", "away", "off", "tight", "close", "closer",
}

# Verb conjugation map for "She X-s" -> "YOU X" rewrites.
# Add new verbs here when you spot a missed conjugation in the wild.
VERB_DECONJ = {
    # forms of be/have/do
    "is": "are",
    "was": "were",
    "has": "have",
    "does": "do",
    "doesn't": "don't",
    "isn't": "aren't",
    "wasn't": "weren't",
    "hasn't": "haven't",
    # contractions
    "'s": "'re",     # She's -> YOU're
    "'d": "'d",
    "'ll": "'ll",
    "'ve": "'ve",
    "'m": "'re",     # rare
    # irregular conjugations
    "goes": "go",
    "tries": "try",
    "cries": "cry",
    "flies": "fly",
    "carries": "carry",
    "brushes": "brush",
    "kisses": "kiss",
    "watches": "watch",
    "catches": "catch",
    "pushes": "push",
    "passes": "pass",
    "misses": "miss",
    "presses": "press",
    "crosses": "cross",
    "guesses": "guess",
    "buzzes": "buzz",
    "fixes": "fix",
}


def deconj_verb(w: str) -> str:
    """Convert third-person-singular verb form to base form for YOU subject."""
    if w in VERB_DECONJ:
        return VERB_DECONJ[w]
    # Regular -es / -ies / -s endings
    if w.endswith("ies") and len(w) > 3:
        return w[:-3] + "y"
    if w.endswith("sses") or w.endswith("shes") or w.endswith("ches") or w.endswith("xes"):
        return w[:-2]  # kisses -> kiss (already covered above) / fixes
    if w.endswith("s") and not w.endswith("ss") and len(w) > 2:
        return w[:-1]
    return w


def rewrite_narrator_en(line: str) -> tuple[str, int]:
    """
    Rewrite an English NARRATOR line: replace MC refs with YOU/YOUR/YOURS.
    Returns (new_line, num_changes). Conservative — only touches references
    that pass the same disambiguation as `check_file`.
    """
    if not line.lstrip().startswith("NARRATOR:"):
        return line, 0

    prefix, content = line.split("NARRATOR:", 1)
    new_content = content
    changes = 0

    # 1) Replace MC NAME tokens.
    # 1a) Possessive form first: "Selena's" → "YOUR".
    new_content, n1 = re.subn(rf"\b{re.escape(DEFAULT_MC_NAME)}'s\b", "YOUR", new_content)
    # 1b) "Selena <verb-s>" → "YOU <verb>" — deconjugate the following verb so
    #     we don't leave broken English like "YOU writes" / "YOU stands".
    def _mc_verb_replace(m: re.Match) -> str:
        verb = m.group(1)
        new_verb = deconj_verb(verb)
        if new_verb == verb:
            return m.group(0)  # not a recognizable verb; leave for 1c
        return "YOU " + new_verb
    new_content, n2 = re.subn(
        rf"\b{re.escape(DEFAULT_MC_NAME)}\s+([a-z]+(?:s|'s|'d|'ll|'ve|'re|'m))\b",
        _mc_verb_replace,
        new_content,
    )
    # 1c) Bare MC name (anything left): "Selena" → "YOU".
    new_content, n3 = re.subn(rf"\b{re.escape(DEFAULT_MC_NAME)}\b", "YOU", new_content)
    changes += n1 + n2 + n3

    # 2) Replace pronouns, only when not preceded by a whitelisted other-female subject.
    # Walk the line left-to-right keeping track of the most recent capitalized name.
    # IMPORTANT: try pronoun match BEFORE name match — otherwise "She" gets
    # consumed as a generic capitalized name token and never reaches pronoun
    # rewriting.
    out_chars: list[str] = []
    i = 0
    last_subject: str | None = None
    while i < len(new_content):
        # Match a pronoun token first.
        pm = re.match(r"(She|she|Her|her|Hers|hers)\b", new_content[i:]) if (i == 0 or not new_content[i-1].isalpha()) else None
        if pm:
            word = pm.group(1)
            after = new_content[i + pm.end():]
            # If most recent named subject is a whitelisted OTHER female -> keep.
            if is_other_female_subject(last_subject):
                out_chars.append(word)
                i += pm.end()
                continue
            # MC ref. Decide replacement.
            if word in ("She", "she"):
                # Contraction immediately attached: She's / She'd / She'll / She've.
                contr = re.match(r"('s|'d|'ll|'ve|'re|'m)", after)
                if contr:
                    suffix = contr.group(1)
                    new_suffix = VERB_DECONJ.get(suffix, suffix)
                    out_chars.append("YOU" + new_suffix)
                    i += pm.end() + contr.end()
                    changes += 1
                    continue
                # Whitespace-separated verb: deconjugate "She bats" -> "YOU bat".
                ahead = re.match(r"\s+([A-Za-z']+)", after)
                if ahead:
                    verb_orig = ahead.group(1)
                    verb_new = deconj_verb(verb_orig)
                    if verb_new != verb_orig:
                        out_chars.append("YOU" + ahead.group(0).replace(verb_orig, verb_new, 1))
                        i += pm.end() + ahead.end()
                        changes += 1
                        continue
                out_chars.append("YOU")
            elif word in ("Her", "her"):
                # YOUR (possessive) vs YOU (object) heuristic.
                ahead = re.match(r"\s+([a-zA-Z']+)", after)
                next_word = ahead.group(1).lower() if ahead else ""
                if next_word in HER_OBJECT_FOLLOWERS:
                    out_chars.append("YOU")
                else:
                    out_chars.append("YOUR")
            elif word in ("Hers", "hers"):
                out_chars.append("YOURS")
            i += pm.end()
            changes += 1
            continue
        # Track latest name token (after pronoun check).
        # IMPORTANT: ignore tokens that aren't KNOWN female characters.
        # - YOU/YOUR/YOURS: rewriter output, not a name
        # - Last names ("Cortez" / "Reyes" / "Sutton") and male names ("Diego"):
        #   would clobber a known last_subject set earlier in the sentence.
        # - **MC** possessive ("Selena's mother. She works..."): the kin is
        #   a different person. Don't update last_subject. Non-MC possessive
        #   ("Elena's eyes go soft. She turns...") still keeps Elena as the
        #   antecedent of "she", so we DO update.
        nm = re.match(r"([A-Z][a-zA-Z]+)", new_content[i:])
        if nm:
            tok = nm.group(1)
            after_name = new_content[i + nm.end(): i + nm.end() + 2]
            is_possessive = after_name.startswith("'s")
            is_mc_possessive = is_possessive and tok == DEFAULT_MC_NAME
            if (
                not is_mc_possessive
                and tok not in ("YOU", "YOUR", "YOURS")
                and (tok == DEFAULT_MC_NAME or is_other_female_subject(tok))
            ):
                last_subject = tok
            out_chars.append(nm.group(0))
            i += nm.end()
            continue
        # Default: copy character.
        out_chars.append(new_content[i])
        i += 1

    return prefix + "NARRATOR:" + "".join(out_chars), changes


def rewrite_narrator_zh(line: str) -> tuple[str, int]:
    """
    Rewrite a Chinese NARRATOR line: 她→YOU, 她的→YOUR (only when no
    whitelisted other-female Latin name precedes them).
    Selena → YOU.
    """
    if not line.lstrip().startswith("NARRATOR:"):
        return line, 0
    prefix, content = line.split("NARRATOR:", 1)
    new_content = content
    changes = 0

    # MC name + possessive forms.
    # Two-pass for CJK spacing convention (YOUR 妈, not YOUR妈):
    # - first pass adds trailing space if 的 is followed by CJK
    # - second pass handles end-of-line / punctuation cases
    new_content, n0a = re.subn(
        rf"{re.escape(DEFAULT_MC_NAME)}\s*的(?=[一-鿿])",
        "YOUR ",
        new_content,
    )
    new_content, n0b = re.subn(
        rf"{re.escape(DEFAULT_MC_NAME)}\s*的", "YOUR", new_content,
    )
    new_content, n1 = re.subn(rf"{re.escape(DEFAULT_MC_NAME)}", "YOU", new_content)
    changes += n0a + n0b + n1

    # 她的 / 她 — track preceding subject.
    out: list[str] = []
    i = 0
    last_subject: str | None = None

    def _emit_token(token: str):
        """Append a Latin token (YOU/YOUR/YOURS) with appropriate spacing
        around adjacent CJK characters — matches the existing ZH convention
        (e.g. ep_1_final.zh.md uses 'YOU 还是', not 'YOU还是')."""
        if out and out[-1] and not out[-1].endswith((" ", " ")):
            last_ch = out[-1][-1]
            if "一" <= last_ch <= "鿿":  # CJK Unified Ideograph
                out.append(" ")
        out.append(token)
        # trailing space inserted only if next char is CJK; handled at write-time

    while i < len(new_content):
        nm = re.match(r"([A-Z][a-zA-Z]+)", new_content[i:])
        if nm:
            tok = nm.group(1)
            # Same disambiguation as EN: only known names become last_subject,
            # and **MC** possessive ("Selena's") doesn't override.
            after_name = new_content[i + nm.end(): i + nm.end() + 2]
            is_possessive = after_name.startswith("'s")
            is_mc_possessive = is_possessive and tok == DEFAULT_MC_NAME
            if (
                not is_mc_possessive
                and tok not in ("YOU", "YOUR", "YOURS")
                and (tok == DEFAULT_MC_NAME or is_other_female_subject(tok))
            ):
                last_subject = tok
            out.append(nm.group(0))
            i += nm.end()
            continue
        if new_content[i:i + 2] == "她的":
            if is_other_female_subject(last_subject):
                out.append("她的")
            else:
                _emit_token("YOUR")
                # Add space before next CJK char if any
                if i + 2 < len(new_content) and "一" <= new_content[i + 2] <= "鿿":
                    out.append(" ")
                changes += 1
            i += 2
            continue
        if new_content[i] == "她":
            if is_other_female_subject(last_subject):
                out.append("她")
            else:
                _emit_token("YOU")
                if i + 1 < len(new_content) and "一" <= new_content[i + 1] <= "鿿":
                    out.append(" ")
                changes += 1
            i += 1
            continue
        out.append(new_content[i])
        i += 1

    return prefix + "NARRATOR:" + "".join(out), changes


PRONOUN_TOKENS = {"She", "Her", "Hers", "He", "His", "Him", "It", "They", "Them",
                  "Their", "I", "Me", "My", "We", "Us", "Our", "You", "YOU",
                  "YOUR", "YOURS"}


def find_subject_before(line: str, pronoun_pos: int) -> str | None:
    """Return the closest KNOWN name token preceding pronoun_pos, or None.

    Walks the head text right-to-left and returns the closest token that is
    either the MC name or a whitelisted OTHER female. Pronoun tokens
    (She/He/I/...) and rewriter outputs (YOU/YOUR/YOURS) are skipped, as are
    unknown last names ("Cortez"/"Reyes") and possessive forms ("Selena's
    mother") — both would otherwise clobber the real subject and produce
    false-positive MC violations.

    If no known female is found, falls back to the closest non-pronoun token
    (so the validator still flags lines with truly unknown subjects).
    """
    head = line[:pronoun_pos]
    matches = list(NAME_TOKEN_RE.finditer(head))
    fallback: str | None = None
    for m in reversed(matches):
        tok = m.group(1)
        if tok in PRONOUN_TOKENS:
            continue
        # Skip ONLY MC possessive: "Selena's mother. She works..." — the
        # following "she" usually refers to the kin, not Selena. Non-MC
        # possessive ("Elena's eyes go soft. She turns...") still has
        # Elena as the effective subject for the next pronoun.
        end = m.end()
        is_possessive = head[end:end + 2].startswith("'s")
        if is_possessive and tok == DEFAULT_MC_NAME:
            continue
        if fallback is None:
            fallback = tok
        if tok == DEFAULT_MC_NAME or is_other_female_subject(tok):
            return tok
    return fallback


def is_other_female_subject(subj: str | None) -> bool:
    if not subj:
        return False
    if subj in OTHER_FEMALE_CHARS:
        return True
    return subj.lower() in OTHER_FEMALE_LOWER


# Match @option lines and capture the quoted label.
OPTION_LINE_RE = re.compile(
    r"""^(?P<indent>\s*)@option\s+\S+(?:\s+(?:brave|safe))?\s+
        "(?P<label>(?:[^"\\]|\\.)*)"\s*\{""",
    re.VERBOSE,
)


# ---------------------------------------------------------------------------
# Checkers
# ---------------------------------------------------------------------------


def check_file(path: Path, mc_name: str, is_zh: bool) -> list[Violation]:
    out: list[Violation] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"warn: cannot read {path}: {exc}", file=sys.stderr)
        return out

    lines = text.splitlines()

    for idx, raw in enumerate(lines, start=1):
        # NARRATOR check
        if raw.lstrip().startswith("NARRATOR:"):
            content = raw.split("NARRATOR:", 1)[1]

            # 1) MC name in NARRATOR is ALWAYS a violation.
            if re.search(rf"\b{re.escape(mc_name)}\b", content):
                out.append(Violation(
                    file=str(path), line_no=idx, kind="narrator_mc_name",
                    snippet=raw.strip(),
                    suggestion=f"replace '{mc_name}' (and possessive) with YOU/YOUR",
                ))

            # 2) ZH-specific: any "她"/"她的" in NARRATOR is suspect
            if is_zh:
                # Simple heuristic: if 她 occurs and no other-female-name appears
                # earlier in the line, flag.
                for zh_pron in ("她的", "她"):
                    if zh_pron in content:
                        head_zh = content.split(zh_pron, 1)[0]
                        # Detect Latin-name subject in the Chinese line
                        latin_subjects = NAME_TOKEN_RE.findall(head_zh)
                        if not latin_subjects or not any(
                            is_other_female_subject(s) for s in latin_subjects
                        ):
                            out.append(Violation(
                                file=str(path), line_no=idx,
                                kind="narrator_mc_ref",
                                snippet=raw.strip(),
                                suggestion=f"'{zh_pron}' refers to MC -> "
                                           f"replace with {'YOUR' if zh_pron == '她的' else 'YOU'}",
                            ))
                            break  # one report per line is enough

            # 3) EN pronouns: she / her / hers in NARRATOR.
            if not is_zh or re.search(r"[A-Za-z]{3,}", content):
                # Even ZH files may have English subclauses; check pronouns too.
                for m in PRONOUN_RE.finditer(content):
                    word = m.group(1)
                    subj = find_subject_before(content, m.start())
                    # If preceding subject is whitelisted OTHER female -> keep.
                    if is_other_female_subject(subj):
                        continue
                    # If preceding subject is MC name -> already flagged above; skip.
                    if subj == mc_name:
                        continue
                    # Otherwise -> default MC violation.
                    out.append(Violation(
                        file=str(path), line_no=idx, kind="narrator_mc_ref",
                        snippet=raw.strip(),
                        suggestion=f"'{word}' refers to MC (no other-female "
                                   f"subject preceding) -> replace with "
                                   f"{'YOUR' if word.lower() == 'her' else 'YOURS' if word.lower() == 'hers' else 'YOU'}",
                    ))
                    break  # report once per line; user will see context

        # @option length check
        m = OPTION_LINE_RE.match(raw)
        if m:
            label = m.group("label")
            if is_zh:
                width = east_asian_width(label)
                if width > OPT_LABEL_MAX_ZH_WIDTH:
                    out.append(Violation(
                        file=str(path), line_no=idx, kind="option_too_long",
                        snippet=raw.strip(),
                        suggestion=f"label visible width {width} > "
                                   f"{OPT_LABEL_MAX_ZH_WIDTH}; "
                                   f"shorten to a gist, move full dialogue inside "
                                   f"the option block as a SELENA: line",
                    ))
            else:
                if len(label) > OPT_LABEL_MAX_EN:
                    out.append(Violation(
                        file=str(path), line_no=idx, kind="option_too_long",
                        snippet=raw.strip(),
                        suggestion=f"label length {len(label)} > "
                                   f"{OPT_LABEL_MAX_EN}; "
                                   f"shorten to a gist, move full dialogue inside "
                                   f"the option block as a SELENA: line",
                    ))

    return out


def find_scripts(root: Path) -> list[Path]:
    """Resolve scripts dir or single file to a list of files to check."""
    if root.is_file():
        return [root] if root.suffix == ".md" else []
    paths: list[Path] = []
    for p in sorted(root.glob("ep_*_final*.md")):
        if p.name.endswith("arc-review-prescriptions.md"):
            continue
        paths.append(p)
    return paths


def fix_file(path: Path, is_zh: bool) -> int:
    """Apply NARRATOR auto-fix in-place. Returns total replacements made."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    total = 0
    changed = False
    for idx, raw in enumerate(lines):
        nl_suffix = ""
        body = raw
        for nl in ("\r\n", "\n", "\r"):
            if body.endswith(nl):
                nl_suffix = nl
                body = body[: -len(nl)]
                break
        rewriter = rewrite_narrator_zh if is_zh else rewrite_narrator_en
        new_body, n = rewriter(body)
        if n:
            lines[idx] = new_body + nl_suffix
            total += n
            changed = True
    if changed:
        path.write_text("".join(lines), encoding="utf-8")
    return total


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scripts_dir",
                        help="path to 05-episode-writer/scripts/ OR a single .md file")
    parser.add_argument("--mc-name", default=DEFAULT_MC_NAME)
    parser.add_argument("--fail-on-violation", action="store_true")
    parser.add_argument("--summary-only", action="store_true",
                        help="print only counts per file")
    parser.add_argument("--fix", action="store_true",
                        help="auto-fix NARRATOR pronouns in-place; "
                             "option-length is reported only")
    args = parser.parse_args(argv)

    root = Path(args.scripts_dir).resolve()
    if not root.exists():
        print(f"error: path does not exist: {root}", file=sys.stderr)
        return 2

    files = find_scripts(root)

    if args.fix:
        total_fixed = 0
        for f in files:
            is_zh = f.name.endswith(".zh.md")
            n = fix_file(f, is_zh=is_zh)
            if n:
                print(f"[fix] {f.name}: {n} pronoun replacement(s)")
                total_fixed += n
        print(f"\n[fix] total {total_fixed} replacements")

    all_violations: list[Violation] = []

    for f in files:
        is_zh = f.name.endswith(".zh.md")
        v = check_file(f, mc_name=args.mc_name, is_zh=is_zh)
        all_violations.extend(v)

    # Group by file for summary.
    by_file: dict[str, list[Violation]] = {}
    for v in all_violations:
        by_file.setdefault(v.file, []).append(v)

    if args.summary_only:
        if not by_file:
            print("[OK] zero violations across all files")
        else:
            for fpath, vs in sorted(by_file.items()):
                kinds = {}
                for v in vs:
                    kinds[v.kind] = kinds.get(v.kind, 0) + 1
                kstr = ", ".join(f"{k}={n}" for k, n in sorted(kinds.items()))
                print(f"{Path(fpath).name}: {len(vs)} ({kstr})")
            print(f"\nTOTAL: {len(all_violations)} violations across {len(by_file)} files")
    else:
        for fpath, vs in sorted(by_file.items()):
            print(f"\n=== {fpath} — {len(vs)} violation(s) ===")
            for v in vs:
                print(v.render())
        if not all_violations:
            print("[OK] zero violations across all files")
        else:
            print(f"\nTOTAL: {len(all_violations)} violations across {len(by_file)} files")

    if all_violations and args.fail_on_violation:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
