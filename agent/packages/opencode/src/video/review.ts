import { parsePromptFile } from "./prompt"

export interface ReviewCheck {
  id: string
  title: string
  ok: boolean
  detail: string
}

export interface ReviewReport {
  ok: boolean
  score: number
  passed: number
  total: number
  checks: ReviewCheck[]
}

export interface CompareReport {
  score: number
  candidate: ReviewReport
  reference: ReviewReport
  deltas: {
    score: number
    bodyLength: number
    timecodeCount: number
    imageMarkerCount: number
    forbiddenCount: number
  }
}

const REQUIRED_FRONTMATTER = ["shot_id", "duration", "shot_function", "prev_shot_recap", "next_shot_setup", "assets"]
const FORBIDDEN_TERMS = ["subtitle", "caption", "logo", "watermark", "字幕", "水印"]

export async function reviewPromptFile(filePath: string): Promise<ReviewReport> {
  const doc = await parsePromptFile(filePath)
  const body = doc.body
  const checks: ReviewCheck[] = []
  const add = (id: string, title: string, ok: boolean, detail: string) => checks.push({ id, title, ok, detail })

  const missing = REQUIRED_FRONTMATTER.filter((key) => doc.frontmatter[key] === undefined)
  add("F1", "frontmatter required fields", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all required fields present")

  add("F2", "body length", body.length >= 900, `${body.length} chars`)
  add("F3", "style declaration", /风格|style|cel-shaded|韩漫|动漫/.test(body), "style signal present")
  add("F4", "character uniqueness", /唯一|仅为一人|分身|复制/.test(body), "uniqueness constraints present")
  add("F5", "@image mapping", /@图\d+/.test(body), `@图 markers: ${markerCount(body, /@图\d+/g)}`)
  add("F6", "narrative arc", /故事线|叙事|情绪|emotion/.test(body), "narrative signal present")
  add("F7", "timed shot plan", markerCount(body, /\b\d+(?:\.\d+)?-\d+(?:\.\d+)?s\b/g) >= 2, `timecodes: ${markerCount(body, /\b\d+(?:\.\d+)?-\d+(?:\.\d+)?s\b/g)}`)
  add("F8", "final hold", /最后\s*2s|三重静止|静止构图/.test(body), "final hold signal present")
  add("F9", "sound layer", /音效层|环境音|动作音|对白|配乐/.test(body), "sound layer present")
  add("F10", "negative constraints", /禁止/.test(body), `forbidden terms: ${markerCount(body, /禁止/g)}`)
  add("F11", "no onscreen text rule", FORBIDDEN_TERMS.every((term) => body.toLowerCase().includes(term.toLowerCase())), "subtitle/logo/watermark bans present")
  add("F12", "asset list", /素材上传清单|assets:\s*\n|素材清单/.test(body), "asset list signal present")

  const passed = checks.filter((item) => item.ok).length
  const score = Math.round((passed / checks.length) * 100)
  return { ok: passed === checks.length, score, passed, total: checks.length, checks }
}

export async function comparePromptFiles(candidatePath: string, referencePath: string): Promise<CompareReport> {
  const [candidate, reference, candidateDoc, referenceDoc] = await Promise.all([
    reviewPromptFile(candidatePath),
    reviewPromptFile(referencePath),
    parsePromptFile(candidatePath),
    parsePromptFile(referencePath),
  ])
  const candidateMetrics = metrics(candidateDoc.body)
  const referenceMetrics = metrics(referenceDoc.body)
  const structureScore = reference.score === 0 ? candidate.score : Math.min(100, Math.round((candidate.score / reference.score) * 100))
  const lengthScore = ratioScore(candidateMetrics.bodyLength, referenceMetrics.bodyLength)
  const timecodeScore = ratioScore(candidateMetrics.timecodeCount, Math.max(1, referenceMetrics.timecodeCount))
  const imageScore = ratioScore(candidateMetrics.imageMarkerCount, Math.max(1, referenceMetrics.imageMarkerCount))
  const forbiddenScore = ratioScore(candidateMetrics.forbiddenCount, Math.max(1, referenceMetrics.forbiddenCount))
  const score = Math.round((structureScore * 0.5) + (lengthScore * 0.2) + (timecodeScore * 0.1) + (imageScore * 0.1) + (forbiddenScore * 0.1))

  return {
    score,
    candidate,
    reference,
    deltas: {
      score: candidate.score - reference.score,
      bodyLength: candidateMetrics.bodyLength - referenceMetrics.bodyLength,
      timecodeCount: candidateMetrics.timecodeCount - referenceMetrics.timecodeCount,
      imageMarkerCount: candidateMetrics.imageMarkerCount - referenceMetrics.imageMarkerCount,
      forbiddenCount: candidateMetrics.forbiddenCount - referenceMetrics.forbiddenCount,
    },
  }
}

function markerCount(text: string, regex: RegExp): number {
  return text.match(regex)?.length ?? 0
}

function metrics(body: string) {
  return {
    bodyLength: body.length,
    timecodeCount: markerCount(body, /\b\d+(?:\.\d+)?-\d+(?:\.\d+)?s\b/g),
    imageMarkerCount: markerCount(body, /@图\d+/g),
    forbiddenCount: markerCount(body, /禁止/g),
  }
}

function ratioScore(candidate: number, reference: number): number {
  if (reference <= 0) return 100
  return Math.min(100, Math.round((candidate / reference) * 100))
}
