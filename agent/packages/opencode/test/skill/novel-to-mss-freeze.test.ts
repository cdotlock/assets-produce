import { test, expect } from "bun:test"
import { readdirSync, readFileSync, existsSync } from "fs"
import path from "path"

const REPO = path.resolve(import.meta.dir, "../../../../..")
const CORPUS = path.join(REPO, "knowledge/novel-to-mss")
const EXPECTED = [
  "novel-evaluator","character-architect","bible-reviewer","entity-planner",
  "planner-reviewer","entity-normalizer","entity-rename","rename-reviewer",
  "episode-writer","episode-writer-reviewer","arc-reviewer",
]

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
