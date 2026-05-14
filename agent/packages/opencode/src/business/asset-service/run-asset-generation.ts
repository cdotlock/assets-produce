// runAssetGeneration — the AI-native "mini agent loop" driver.
//
// In production an LLM-backed loop will decide which atomic tool to call,
// orchestrate intermediate steps, and ultimately produce an OSS url. That
// loop is *injected* here via AssetGenerator so unit tests can stub it.
// runAssetGeneration itself owns the AssetJob state machine, the
// intent→skill resolution, and the Asset row writeback — all the
// deterministic pieces around the LLM nondeterminism.
//
// Status transitions per job:
//   queued / running  →  running   (always; idempotent)
//      success path   →  succeeded (asset_id set)
//      failure path   →  failed    (error_code + error_message set)
//   succeeded / failed / cancelled → no-op (caller racing with worker)

import { AssetServiceError } from "./errors"
import { AssetJobRepo } from "./asset-job.repo"
import { intentToSkill, type SkillPicker } from "./intent-to-skill"
import { buildTraceEnd, nullTracer, type Tracer } from "./tracer"
import type { AssetIntent, AssetKind, AssetPreferences } from "./types"
import type { AssetJobRow } from "./asset-job.sql"

// ---------- Asset top-level type derived from intent.kind ----------
type AssetType = "image" | "video" | "audio" | "script" | "metadata"

function defaultAssetTypeForKind(kind: AssetKind): AssetType {
  if (kind === "shot_video") return "video"
  return "image"
}

// ---------- AssetWriter (injectable; default uses raw drizzle insert) ----------

export interface AssetWriterInput {
  project_id: string
  type: AssetType
  kind: AssetKind | null
  key: string
  name: string | null
  url: string
  prompt?: string | null
  ref_urls?: unknown
}

export interface AssetWriterOutput {
  asset_id: string
  key: string
  version: number
  kind: AssetKind | null
  url: string
  ref_urls: unknown
}

export interface AssetWriter {
  write(input: AssetWriterInput): Promise<AssetWriterOutput>
}

// ---------- AssetGenerator (the part that's stubbed in tests) ----------

export interface AssetGeneratorInput {
  job_id: string
  project_id: string
  intent: AssetIntent
  skill: string
  preferences?: AssetPreferences
  maxSteps: number
}

export type GenerationOutcome =
  | {
      ok: true
      atomic_tool: string
      url: string
      ref_urls?: unknown
      langfuse_trace_id?: string | null
      asset_type?: AssetType
      steps?: number
    }
  | {
      ok: false
      // Public error codes that map to the AssetService error envelope.
      code: "BUDGET_EXCEEDED" | "GENERATION_REJECTED" | "ATOMIC_TOOL_FAILED"
      message: string
      steps?: number
      langfuse_trace_id?: string | null
    }

export interface AssetGenerator {
  generate(input: AssetGeneratorInput): Promise<GenerationOutcome>
}

// ---------- Top-level entry ----------

export interface RunAssetGenerationInput {
  job_id: string
}

export interface RunAssetGenerationDeps {
  jobRepo: AssetJobRepo
  generator: AssetGenerator
  writer: AssetWriter
  // Optional override for intent-to-skill's picker.
  skillPicker?: SkillPicker
  // Defaults to ASSETS_SERVICE_MAX_STEPS_PER_JOB-equivalent (30 per spec § 6.1).
  maxSteps?: number
  // Optional per-job tracer. When set, its trace.id wins over the
  // generator-supplied outcome.langfuse_trace_id (the tracer is the
  // "owner" of the trace; the outcome's id is a fallback for paths that
  // don't go through this driver).
  tracer?: Tracer
}

export const DEFAULT_MAX_STEPS = 30

const TERMINAL_STATUSES: ReadonlySet<AssetJobRow["status"]> = new Set(["succeeded", "failed", "cancelled"])

export async function runAssetGeneration(
  input: RunAssetGenerationInput,
  deps: RunAssetGenerationDeps,
): Promise<AssetJobRow> {
  const job = deps.jobRepo.findById(input.job_id)
  if (!job) {
    throw new AssetServiceError({
      code: "NOT_FOUND",
      op: "runAssetGeneration.findJob",
      message: `AssetJob ${input.job_id} not found`,
    })
  }
  if (TERMINAL_STATUSES.has(job.status)) return job

  // Mark running so concurrent poll → status reads see queued → running.
  deps.jobRepo.updateStatus(job.id, { status: "running" })

  const intent = job.intent as AssetIntent
  const preferences = undefined // job.intent already encodes preferences if any
  const maxSteps = deps.maxSteps ?? DEFAULT_MAX_STEPS
  const tracer = deps.tracer ?? nullTracer

  // Helper that picks tracer.id when present, else generator-supplied id.
  const traceIdFor = (outcome?: GenerationOutcome): string | null => {
    if (trace.id) return trace.id
    return outcome && "langfuse_trace_id" in outcome ? outcome.langfuse_trace_id ?? null : null
  }

  // ---------- Tier 1: pick skill ----------
  let skill: string
  try {
    skill = await intentToSkill({ intent, preferences, picker: deps.skillPicker })
  } catch (e) {
    // Start a partial trace just so we can emit a failure event.
    const trace = tracer.startJob({
      job_id: job.id,
      project_id: job.project_id,
      intent,
      skill: "<unresolved>",
      preferences,
      maxSteps,
    })
    const code = extractCode(e) ?? "INTERNAL"
    const message = extractMessage(e) ?? "intent-to-skill failed"
    trace.end(buildTraceEnd({ failure: { code, message } }))
    return deps.jobRepo.updateStatus(job.id, {
      status: "failed",
      error_code: code,
      error_message: message,
      langfuse_trace_id: trace.id || null,
    })!
  }

  const trace = tracer.startJob({
    job_id: job.id,
    project_id: job.project_id,
    intent,
    skill,
    preferences,
    maxSteps,
  })
  trace.event("skill.picked", { skill })

  // ---------- Tier 2: run the agent loop (stubbed in tests) ----------
  let outcome: GenerationOutcome
  try {
    outcome = await deps.generator.generate({
      job_id: job.id,
      project_id: job.project_id,
      intent,
      skill,
      preferences,
      maxSteps,
    })
  } catch (e) {
    const message = extractMessage(e) ?? "atomic tool threw"
    trace.end(buildTraceEnd({ failure: { code: "ATOMIC_TOOL_FAILED", message } }))
    return deps.jobRepo.updateStatus(job.id, {
      status: "failed",
      error_code: "ATOMIC_TOOL_FAILED",
      error_message: message,
      langfuse_trace_id: traceIdFor(),
    })!
  }

  if (!outcome.ok) {
    trace.end(buildTraceEnd({ outcome }))
    return deps.jobRepo.updateStatus(job.id, {
      status: "failed",
      error_code: outcome.code,
      error_message: outcome.message,
      langfuse_trace_id: traceIdFor(outcome),
    })!
  }

  trace.event("generator.ok", { atomic_tool: outcome.atomic_tool, steps: outcome.steps })

  // ---------- Tier 3: write Asset row + finalize ----------
  let written: AssetWriterOutput
  try {
    written = await deps.writer.write({
      project_id: job.project_id,
      type: outcome.asset_type ?? defaultAssetTypeForKind(intent.kind),
      kind: intent.kind,
      key: intent.key,
      name: intent.name ?? null,
      url: outcome.url,
      prompt: intent.spec_md,
      ref_urls: outcome.ref_urls,
    })
  } catch (e) {
    const message = extractMessage(e) ?? "asset writer failed"
    trace.end(buildTraceEnd({ outcome, failure: { code: "INTERNAL", message } }))
    return deps.jobRepo.updateStatus(job.id, {
      status: "failed",
      error_code: "INTERNAL",
      error_message: message,
      langfuse_trace_id: traceIdFor(outcome),
    })!
  }

  trace.end(buildTraceEnd({ outcome, asset_id: written.asset_id }))
  return deps.jobRepo.updateStatus(job.id, {
    status: "succeeded",
    asset_id: written.asset_id,
    langfuse_trace_id: traceIdFor(outcome),
  })!
}

// ---------- helpers ----------

function extractCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null && "data" in err) {
    const data = (err as { data?: unknown }).data
    if (typeof data === "object" && data !== null && "code" in data) {
      const c = (data as { code?: unknown }).code
      return typeof c === "string" ? c : null
    }
  }
  return null
}

function extractMessage(err: unknown): string | null {
  if (typeof err === "object" && err !== null) {
    const data = (err as { data?: unknown }).data
    if (typeof data === "object" && data !== null && "message" in data) {
      const m = (data as { message?: unknown }).message
      if (typeof m === "string") return m
    }
    if ("message" in (err as object)) {
      const m = (err as { message?: unknown }).message
      if (typeof m === "string") return m
    }
  }
  if (typeof err === "string") return err
  return null
}
