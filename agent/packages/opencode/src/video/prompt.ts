import * as fs from "fs/promises"
import * as path from "path"
import matter from "gray-matter"

export interface PromptDocument {
  path: string
  frontmatter: Record<string, unknown>
  body: string
}

export async function parsePromptFile(filePath: string): Promise<PromptDocument> {
  const absPath = path.resolve(filePath)
  const raw = await fs.readFile(absPath, "utf8")
  if (!raw.startsWith("---")) throw new Error("missing YAML frontmatter")

  const parsed = matter(raw)
  const frontmatter =
    parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
      ? (parsed.data as Record<string, unknown>)
      : {}
  const rawFrontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
  const rawRatio = rawFrontmatter?.match(/^ratio:\s*("?)([^"\n#]+)\1\s*(?:#.*)?$/m)?.[2]?.trim()
  if (rawRatio) frontmatter.ratio = rawRatio
  const body = parsed.content.trim()
  if (!body) throw new Error("prompt body is empty")

  return {
    path: absPath,
    frontmatter,
    body,
  }
}
