import * as path from "path"
import {
  type AssetRef,
  mapValue,
  resolveAssetURL,
  stringSlice,
  stringValue,
} from "./assets"
import type { PromptDocument } from "./prompt"
import { parsePromptFile } from "./prompt"

export const DEFAULT_RATIO = "9:16"
export const DEFAULT_RESOLUTION = "720P"

export interface PayloadOptions {
  projectRoot: string
  allowNonOSS?: boolean
  allowTextOnly?: boolean
}

export interface VideoPayload {
  action: "generate"
  prompt: string
  duration: number
  ratio: string
  resolution: string
  sourceImageUrl?: string
  referenceImageUrls?: string[]
  sourceVideoUrls?: string[]
  continuationTailSeconds?: number
}

export async function buildPayload(promptPath: string, opts: PayloadOptions): Promise<VideoPayload> {
  const doc = await parsePromptFile(promptPath)
  return buildPayloadFromDocument(doc, opts)
}

export async function buildPayloadFromDocument(doc: PromptDocument, opts: PayloadOptions): Promise<VideoPayload> {
  const allowNonOSS = Boolean(opts.allowNonOSS)
  const promptDir = path.dirname(doc.path)
  const imageURLs: string[] = []
  for (const ref of collectPayloadImageRefs(doc.frontmatter)) {
    imageURLs.push(await resolveAssetURL(ref.value, ref.expected, opts.projectRoot, allowNonOSS, promptDir))
  }
  const previousFrame = stringValue(doc.frontmatter.previous_frame_url)
  if (previousFrame) {
    appendUnique(
      imageURLs,
      await resolveAssetURL(previousFrame, "previous_frame_url", opts.projectRoot, allowNonOSS, promptDir),
    )
  }

  const videoURLs: string[] = []
  for (const ref of collectPayloadVideoRefs(doc.frontmatter)) {
    videoURLs.push(await resolveAssetURL(ref.value, ref.expected, opts.projectRoot, allowNonOSS, promptDir))
  }
  const previousVideo = stringValue(doc.frontmatter.previous_video_url)
  if (previousVideo) {
    appendUnique(
      videoURLs,
      await resolveAssetURL(previousVideo, "previous_video_url", opts.projectRoot, allowNonOSS, promptDir),
    )
  }

  if (imageURLs.length === 0 && !opts.allowTextOnly) {
    throw new Error(
      "no image OSS URL found. The gateway workflow requires at least one source image URL; upload assets and fill assets.images first",
    )
  }

  const payload: VideoPayload = {
    action: "generate",
    prompt: doc.body,
    duration: parseDuration(doc.frontmatter.duration),
    ratio: stringValue(doc.frontmatter.ratio) ?? DEFAULT_RATIO,
    resolution: stringValue(doc.frontmatter.resolution) ?? DEFAULT_RESOLUTION,
  }

  if (imageURLs.length > 0) {
    payload.sourceImageUrl = imageURLs[0]
    if (imageURLs.length > 1) payload.referenceImageUrls = imageURLs.slice(1)
  }
  if (videoURLs.length > 0) payload.sourceVideoUrls = videoURLs
  if (doc.frontmatter.continuation_tail_seconds !== undefined) {
    payload.continuationTailSeconds = parseDuration(doc.frontmatter.continuation_tail_seconds)
  }
  return payload
}

function collectPayloadImageRefs(frontmatter: Record<string, unknown>): AssetRef[] {
  const refs: AssetRef[] = []
  for (const field of ["first_frame", "last_frame"]) {
    const value = stringValue(frontmatter[field])
    if (value) refs.push({ value, expected: "image" })
  }
  const assetMap = mapValue(frontmatter.assets)
  for (const value of stringSlice(assetMap.images)) refs.push({ value, expected: "image" })
  return refs
}

function collectPayloadVideoRefs(frontmatter: Record<string, unknown>): AssetRef[] {
  const refs: AssetRef[] = []
  const assetMap = mapValue(frontmatter.assets)
  for (const value of stringSlice(assetMap.videos)) refs.push({ value, expected: "video" })
  return refs
}

function appendUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value)
}

export function parseDuration(value: unknown): number {
  if (value === null || value === undefined) return 12
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase().replace(/s$/, "")
    if (!/^[+-]?\d+$/.test(raw)) throw new Error(`invalid duration: ${value}`)
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed)) return parsed
    throw new Error(`invalid duration: ${value}`)
  }
  return 12
}
