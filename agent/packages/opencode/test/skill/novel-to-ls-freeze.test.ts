import { test, expect } from "bun:test"
import { readdirSync, readFileSync, existsSync } from "fs"
import { createHash } from "crypto"
import path from "path"

const REPO = path.resolve(import.meta.dir, "../../../../..")
const CORPUS = path.join(REPO, "knowledge/novel-to-ls")
const EXPECTED = [
  "novel-evaluator","character-architect","bible-reviewer","entity-planner",
  "planner-reviewer","entity-normalizer","entity-rename","rename-reviewer",
  "episode-writer","episode-writer-reviewer","arc-reviewer",
]

// Frozen corpus is LF-only (rsync -a from a unix n2m repo). A CRLF source would silently mis-key (name -> "name\r"), a false-green — acceptable only because the freeze is verbatim from a unix origin.
function frontmatter(md: string): Record<string,string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out: Record<string,string> = {}
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":")
    if (i > 0) out[line.slice(0,i).trim()] = line.slice(i+1).trim()
  }
  return out
}

test("all 11 frozen skill dirs exist with a SKILL.md", () => {
  expect(existsSync(CORPUS)).toBe(true)
  const dirs = readdirSync(CORPUS, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name).sort()
  for (const name of EXPECTED) {
    expect(dirs).toContain(name)
    expect(existsSync(path.join(CORPUS, name, "SKILL.md"))).toBe(true)
  }
})

test("every frozen SKILL.md has name + description frontmatter", () => {
  for (const name of EXPECTED) {
    const fm = frontmatter(readFileSync(path.join(CORPUS, name, "SKILL.md"), "utf8"))
    expect(fm.name, `${name}: missing frontmatter name`).toBeTruthy()
    expect(fm.description, `${name}: missing frontmatter description`).toBeTruthy()
  }
})

test("frozen corpus matches FREEZE_MANIFEST.sha256 (no drift)", () => {
  const manifestPath = path.join(CORPUS, "FREEZE_MANIFEST.sha256")
  expect(existsSync(manifestPath)).toBe(true)
  const lines = readFileSync(manifestPath, "utf8").split("\n").filter(Boolean)
  expect(lines.length).toBeGreaterThanOrEqual(14)
  for (const line of lines) {
    // Format contract: scripts/c1-freeze-novel-to-ls.sh emits 'shasum -a 256' output sed-stripped of './' => <64hex><2 spaces><relpath>. If that script's hash tool/format changes, update these offsets.
    const sha = line.slice(0, 64)
    const rel = line.slice(66) // "<sha>  <relpath>"
    const abs = path.join(CORPUS, rel)
    expect(existsSync(abs), `manifest references missing file: ${rel}`).toBe(true)
    const got = createHash("sha256").update(readFileSync(abs)).digest("hex")
    expect(got, `drift in ${rel}`).toBe(sha)
  }
})
