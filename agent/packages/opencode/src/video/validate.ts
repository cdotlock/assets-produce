import { collectValidationRefs, isHTTPURL, isOSSURL, localRefToSidecarURL } from "./assets"
import { parsePromptFile } from "./prompt"
import * as path from "path"

export interface ValidateOptions {
  projectRoot: string
  timeoutMs?: number
  allowNonOSS?: boolean
  allowEmpty?: boolean
}

export interface ValidateResult {
  url: string
  expected: "image" | "video" | "asset" | "file"
  ok: boolean
  source?: string
  status?: number
  contentType?: string
  size?: number
  error?: string
}

const validImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff"])
const validVideoTypes = new Set(["video/mp4", "video/quicktime", "video/webm", "video/avi", "video/mpeg"])

export async function validatePrompt(promptPath: string, opts: ValidateOptions): Promise<{ ok: boolean; results: ValidateResult[] }> {
  const doc = await parsePromptFile(promptPath)
  const promptDir = path.dirname(doc.path)
  const refs = collectValidationRefs(doc.frontmatter)
  if (refs.length === 0 && !opts.allowEmpty) {
    return {
      ok: false,
      results: [
        {
          url: doc.path,
          expected: "asset",
          ok: false,
          error: "没有找到任何媒体资源；生成前至少需要一个 OSS sourceImageUrl",
        },
      ],
    }
  }

  const results: ValidateResult[] = []
  for (const ref of refs) {
    let url = ref.value
    let source: string | undefined
    if (!isHTTPURL(ref.value)) {
      const sidecar = await localRefToSidecarURL(ref.value, opts.projectRoot, promptDir)
      if (!sidecar.url) {
        const hint = sidecar.checked.length > 1 ? sidecar.checked.join(" or ") : sidecar.sidecar
        results.push({
          url: ref.value,
          expected: ref.expected,
          ok: false,
          error: `本地路径未上传 OSS，缺少 sidecar: ${hint}`,
        })
        continue
      }
      url = sidecar.url
      source = ref.value
    }
    results.push(await checkURL(url, ref.expected, opts.timeoutMs ?? 300_000, Boolean(opts.allowNonOSS), source))
  }
  return { ok: results.every((item) => item.ok), results }
}

async function fetchWithTimeout(url: string, method: "HEAD" | "GET", timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { method, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function checkURL(
  url: string,
  expected: "image" | "video",
  timeoutMs: number,
  allowNonOSS: boolean,
  source?: string,
): Promise<ValidateResult> {
  const result: ValidateResult = { url, expected, ok: false, ...(source ? { source } : {}) }
  if (!isHTTPURL(url)) return { ...result, error: "不是 http(s) URL" }
  if (!allowNonOSS && !isOSSURL(url)) return { ...result, error: "不是 OSS URL" }

  let response: Response
  try {
    response = await fetchWithTimeout(url, "HEAD", timeoutMs)
    if (response.status >= 400 || !response.headers.get("content-type")) {
      response = await fetchWithTimeout(url, "GET", timeoutMs)
    }
  } catch (err) {
    return { ...result, error: err instanceof Error ? err.message : String(err) }
  }

  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
  const contentLength = response.headers.get("content-length")
  const size = contentLength === null ? undefined : Number.parseInt(contentLength, 10)
  const enriched: ValidateResult = {
    ...result,
    status: response.status,
    contentType,
    ...(Number.isFinite(size) ? { size } : {}),
  }
  if (response.status >= 400) return { ...enriched, error: `HTTP ${response.status}` }
  if (expected === "image" && !validImageTypes.has(contentType)) {
    return { ...enriched, error: `Content-Type ${contentType} 不是有效图片类型` }
  }
  if (expected === "video" && !validVideoTypes.has(contentType)) {
    return { ...enriched, error: `Content-Type ${contentType} 不是有效视频类型` }
  }
  if (size === 0) return { ...enriched, error: "Content-Length 为 0" }
  return { ...enriched, ok: true }
}
