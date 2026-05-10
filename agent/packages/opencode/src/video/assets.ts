import * as fs from "fs/promises"
import * as path from "path"

export interface AssetRef {
  value: string
  expected: "image" | "video"
}

export function isHTTPURL(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://")
}

export function isOSSURL(value: string): boolean {
  try {
    const parsed = new URL(value)
    const host = parsed.host.toLowerCase()
    return host.includes(".oss-") || host.startsWith("oss-") || host.includes("aliyuncs.com")
  } catch {
    return false
  }
}

export function sidecarFor(filePath: string): string {
  return `${filePath}.url`
}

export function resolveLocalPath(ref: string, projectRoot: string): string {
  return path.isAbsolute(ref) ? ref : path.join(projectRoot, ref)
}

function uniqueLocalPathCandidates(ref: string, projectRoot: string, promptDir?: string): string[] {
  if (path.isAbsolute(ref)) return [ref]
  const candidates = [path.resolve(projectRoot, ref)]
  if (promptDir) candidates.push(path.resolve(promptDir, ref))
  return Array.from(new Set(candidates))
}

export async function localRefToSidecarURL(
  ref: string,
  projectRoot: string,
  promptDir?: string,
): Promise<{ url: string | undefined; sidecar: string; checked: string[] }> {
  const checked: string[] = []
  for (const localPath of uniqueLocalPathCandidates(ref, projectRoot, promptDir)) {
    const sidecar = sidecarFor(localPath)
    checked.push(sidecar)
    try {
      const raw = await fs.readFile(sidecar, "utf8")
      return { url: raw.trim(), sidecar, checked }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue
      throw err
    }
  }
  return { url: undefined, sidecar: checked[0] ?? sidecarFor(resolveLocalPath(ref, projectRoot)), checked }
}

export async function resolveAssetURL(
  ref: string,
  expected: string,
  projectRoot: string,
  allowNonOSS: boolean,
  promptDir?: string,
): Promise<string> {
  const trimmed = ref.trim()
  if (!trimmed) throw new Error(`invalid ${expected} reference: ${JSON.stringify(ref)}`)

  let resolved = trimmed
  if (!isHTTPURL(trimmed)) {
    const sidecar = await localRefToSidecarURL(trimmed, projectRoot, promptDir)
    if (!sidecar.url) {
      const hint = sidecar.checked.length > 1 ? sidecar.checked.join(" or ") : sidecar.sidecar
      throw new Error(
        `${expected} asset is a local path without an OSS sidecar: ${trimmed}. Upload it first or create ${hint}`,
      )
    }
    resolved = sidecar.url
  }

  if (!isHTTPURL(resolved)) throw new Error(`${expected} sidecar is not an http(s) URL: ${resolved}`)
  if (!allowNonOSS && !isOSSURL(resolved)) throw new Error(`${expected} URL is not recognized as an OSS URL: ${resolved}`)
  return resolved
}

export function stringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const text = typeof value === "string" ? value.trim() : String(value).trim()
  return text.length > 0 ? text : undefined
}

export function stringSlice(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map(stringValue).filter((item): item is string => item !== undefined)
  const single = stringValue(value)
  return single ? [single] : []
}

export function mapValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

export function collectImageRefs(frontmatter: Record<string, unknown>): AssetRef[] {
  const refs: AssetRef[] = []
  for (const field of ["first_frame", "last_frame"]) {
    const value = stringValue(frontmatter[field])
    if (value) refs.push({ value, expected: "image" })
  }
  const assetMap = mapValue(frontmatter.assets)
  for (const value of stringSlice(assetMap.images)) refs.push({ value, expected: "image" })
  const previous = stringValue(frontmatter.previous_frame_url)
  if (previous) refs.push({ value: previous, expected: "image" })
  return refs
}

export function collectVideoRefs(frontmatter: Record<string, unknown>): AssetRef[] {
  const refs: AssetRef[] = []
  const assetMap = mapValue(frontmatter.assets)
  for (const value of stringSlice(assetMap.videos)) refs.push({ value, expected: "video" })
  const previous = stringValue(frontmatter.previous_video_url)
  if (previous) refs.push({ value: previous, expected: "video" })
  return refs
}

export function collectValidationRefs(frontmatter: Record<string, unknown>): AssetRef[] {
  const seen = new Set<string>()
  const out: AssetRef[] = []
  for (const ref of [...collectImageRefs(frontmatter), ...collectVideoRefs(frontmatter)]) {
    const key = `${ref.expected}\0${ref.value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}
