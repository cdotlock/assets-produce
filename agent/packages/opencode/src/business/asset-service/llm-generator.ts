// Phase 14 — the real LLM-driven mini agent loop (spec §15 row 1.14).
//
// `createLlmGenerator()` returns an `AssetGenerator` whose `generate()`:
//   1. loads the skill body + its atomic-tool allowlist from disk,
//   2. picks an LLM (Claude primary, DeepSeek fallback),
//   3. runs a GENERIC tool-calling loop bounded by step + token budgets
//      where the model may ONLY call the skill's allowlisted atomic tools,
//   4. maps the run's terminal tool result onto a `GenerationOutcome`.
//
// There is deliberately NO per-AssetKind branching anywhere in this file
// (architectural red line §2/§12). The only thing that varies per kind is
// *which skill body was picked* — and that already happened upstream in
// intent-to-skill before `generate()` is ever called. Adding a new asset
// type = drop a `knowledge/asset-generation/<name>.md` + register its
// name; this loop is untouched.

import * as fs from "fs"
import * as path from "path"
import { Effect } from "effect"
import { tool, jsonSchema, generateText, stepCountIs, type LanguageModel, type ToolSet } from "ai"

import { AppRuntime } from "@/effect/app-runtime"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import * as EffectZod from "@/util/effect-zod"
import { Tool } from "@/tool/tool"
import { ProviderID, ModelID } from "@/provider/schema"
import { SessionID, MessageID } from "@/session/schema"

import { GenerateImageNanobananaTool } from "@/tool/asset/generate-image-nanobanana"
import { GenerateImageGptTool } from "@/tool/asset/generate-image-gpt"
import { GenerateVideoSeedanceTool } from "@/tool/asset/generate-video-seedance"
import { GenerateSfxElevenlabsTool } from "@/tool/asset/generate-sfx-elevenlabs"
import { GenerateMusicSunoTool } from "@/tool/asset/generate-music-suno"
import { ConcatClipsTool } from "@/tool/asset/concat-clips"
import { CropVideoTool } from "@/tool/asset/crop-video"
import { GenerateVideoHappyHorseTool } from "@/tool/asset/generate-video-happyhorse"
import { CgRenderTool } from "@/tool/asset/cg-render"
import { NrbiRenderPromptTool } from "@/tool/asset/nrbi-render-prompt"
import { UpscaleImageTool } from "@/tool/asset/upscale-image"
import { OssPutTool } from "@/tool/asset/oss-put"
import { MattingTool } from "@/tool/asset/matting"
import { HybridToWebpTool } from "@/tool/asset/hybrid-to-webp"
import { GreenSpillClearTool } from "@/tool/asset/green-spill-clear"
import { RgbUnspillTool } from "@/tool/asset/rgb-unspill"
import { HoleFillTool } from "@/tool/asset/hole-fill"
import { CutoutTool } from "@/tool/asset/cutout"

import { resolveMaxTokensPerJob } from "./budget"
import type { AssetGenerator, AssetGeneratorInput, GenerationOutcome } from "./run-asset-generation"

// ---------- static atomic-tool registry (kebab id → Tool effect) ----------
//
// Mirrors registry.ts:15-31. Kept STATIC and complete so the allowlist
// parser can validate every token against a known id, and so a skill body
// can only ever expose tools that exist.

// Each imported `*Tool` is an `Effect` that yields a `Tool.Info` once its
// service deps (Truncate + Agent, provided by AppRuntime) are available —
// then `Tool.init(info)` produces the callable `Tool.Def`. The asset tools
// have heterogeneous Parameters/Metadata generics, so the map is typed
// loosely; the concrete `Def` is recovered (and used dynamically) at call
// time inside `buildToolSet`.
type AnyToolInfoEffect = Effect.Effect<Tool.Info, never, unknown>

const asInfoEffect = (e: unknown): AnyToolInfoEffect => e as AnyToolInfoEffect

const ATOMIC_TOOLS: Readonly<Record<string, AnyToolInfoEffect>> = {
  "generate-image-nanobanana": asInfoEffect(GenerateImageNanobananaTool),
  "generate-image-gpt": asInfoEffect(GenerateImageGptTool),
  "generate-video-seedance": asInfoEffect(GenerateVideoSeedanceTool),
  "generate-sfx-elevenlabs": asInfoEffect(GenerateSfxElevenlabsTool),
  "generate-music-suno": asInfoEffect(GenerateMusicSunoTool),
  "concat-clips": asInfoEffect(ConcatClipsTool),
  "crop-video": asInfoEffect(CropVideoTool),
  "generate-video-happyhorse": asInfoEffect(GenerateVideoHappyHorseTool),
  "cg-render": asInfoEffect(CgRenderTool),
  "nrbi-render-prompt": asInfoEffect(NrbiRenderPromptTool),
  "upscale-image": asInfoEffect(UpscaleImageTool),
  "oss-put": asInfoEffect(OssPutTool),
  matting: asInfoEffect(MattingTool),
  "hybrid-to-webp": asInfoEffect(HybridToWebpTool),
  "green-spill-clear": asInfoEffect(GreenSpillClearTool),
  "rgb-unspill": asInfoEffect(RgbUnspillTool),
  "hole-fill": asInfoEffect(HoleFillTool),
  cutout: asInfoEffect(CutoutTool),
}

const KNOWN_TOOL_IDS = new Set(Object.keys(ATOMIC_TOOLS))

// ---------- skill body loader ----------

export interface LoadedSkill {
  body: string
  allowlist: string[]
}

// llm-generator.ts lives at src/business/asset-service/ — the same 6-up
// depth that src/tool/asset/cg-render.ts:95 uses to reach the repo root
// (/home/user/assets-produce). Resolve identically so the knowledge dir
// is found regardless of cwd.
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../../..")

/**
 * Parse the `## Atomic tools (allowed)` section of a skill body and return
 * every kebab-case token that exactly matches a known atomic-tool id.
 * Case-insensitive on the heading; collection stops at the next `##`.
 */
export function parseAllowlist(body: string): string[] {
  const lines = body.split(/\r?\n/)
  // 0 = not in the section; otherwise the markdown heading level (2-6)
  // at which the "Atomic tools (allowed)" section was opened.
  let sectionLevel = 0
  const found = new Set<string>()
  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const title = heading[2].trim().toLowerCase()
      if (sectionLevel > 0) {
        // A heading at the section's level or shallower ends it; a
        // deeper sub-heading stays *inside* the section so a skill
        // body can structure its allowlist with sub-sections.
        if (level <= sectionLevel) break
        continue
      }
      if (title.startsWith("atomic tools")) sectionLevel = level
      continue
    }
    if (sectionLevel === 0) continue
    // Collect every backtick-wrapped token AND bare kebab tokens; only
    // those exactly equal to a known tool id survive.
    for (const m of line.matchAll(/[`"]?([a-z0-9]+(?:-[a-z0-9]+)*)[`"]?/g)) {
      const token = m[1]
      if (KNOWN_TOOL_IDS.has(token)) found.add(token)
    }
  }
  return [...found]
}

const defaultLoadSkill = async (skill: string): Promise<LoadedSkill> => {
  const file = path.join(REPO_ROOT, "knowledge", "asset-generation", `${skill}.md`)
  let body: string
  try {
    body = await fs.promises.readFile(file, "utf8")
  } catch {
    throw new SkillInfeasibleError(`skill body not found for "${skill}" (${file})`)
  }
  const allowlist = parseAllowlist(body)
  if (allowlist.length === 0) {
    throw new SkillInfeasibleError(
      `skill "${skill}" declares no usable atomic tools in its "Atomic tools (allowed)" section`,
    )
  }
  return { body, allowlist }
}

// Distinguishes "the skill spec is infeasible / missing" (→ GENERATION_REJECTED,
// not a 500) from genuine internal/tool failures.
export class SkillInfeasibleError extends Error {
  readonly _tag = "SkillInfeasibleError"
}

// ---------- model resolution (Claude primary, DeepSeek fallback) ----------

export interface ResolvedModel {
  model: LanguageModel
  providerID: string
  modelID: string
}

// No new GenerationOutcome codes (§11.4 lock). When neither the primary
// (default, Claude when ANTHROPIC_API_KEY set) nor any DeepSeek fallback
// resolves, we surface this and the loop maps it to GENERATION_REJECTED
// ("no LLM model available" — spec infeasible, not a crash).
export class NoModelAvailableError extends Error {
  readonly _tag = "NoModelAvailableError"
}

// Best-effort, defensive DeepSeek fallback. Probes the Provider's known
// providers/models for a DeepSeek language model. Never throws — returns
// undefined if nothing resolves.
const resolveDeepSeekFallback = Effect.gen(function* () {
  const p = yield* Provider.Service
  const swallow = <A>(e: Effect.Effect<A, unknown, never>, fallback: A) =>
    e.pipe(Effect.catch(() => Effect.succeed(fallback)))

  const probe = (providerID: string, modelID: string): Effect.Effect<ResolvedModel | undefined, never, never> =>
    swallow(
      Effect.gen(function* () {
        const m = yield* p.getModel(ProviderID.make(providerID), ModelID.make(modelID))
        const lang = yield* p.getLanguage(m)
        const r: ResolvedModel = { model: lang as unknown as LanguageModel, providerID, modelID }
        return r as ResolvedModel | undefined
      }) as Effect.Effect<ResolvedModel | undefined, unknown, never>,
      undefined,
    )

  // 1. Ask the provider for the closest DeepSeek-ish model in a known
  //    deepseek provider, if such a provider is configured.
  const closest = yield* swallow(
    p.closest(ProviderID.make("deepseek"), ["deepseek-chat", "deepseek-reasoner", "deepseek"]) as Effect.Effect<
      { providerID: string; modelID: string } | undefined,
      unknown,
      never
    >,
    undefined,
  )
  if (closest) {
    const got = yield* probe(closest.providerID, closest.modelID)
    if (got) return got
  }

  // 2. Scan every configured provider for a model id mentioning deepseek.
  const list = yield* swallow(
    p.list() as Effect.Effect<Record<string, { id: string; models: Record<string, unknown> }>, unknown, never>,
    {} as Record<string, { id: string; models: Record<string, unknown> }>,
  )
  for (const info of Object.values(list)) {
    for (const modelID of Object.keys(info.models ?? {})) {
      if (modelID.toLowerCase().includes("deepseek")) {
        const got = yield* probe(info.id, modelID)
        if (got) return got
      }
    }
  }

  // 3. Last-ditch hardcoded guesses against a literal "deepseek" provider.
  for (const guess of ["deepseek-chat", "deepseek-reasoner"]) {
    const got = yield* probe("deepseek", guess)
    if (got) return got
  }
  return undefined as ResolvedModel | undefined
})

const defaultResolveModel = (): Promise<ResolvedModel> =>
  AppRuntime.runPromise(
    Effect.gen(function* () {
      const p = yield* Provider.Service

      // Primary: the configured default model (Claude when
      // ANTHROPIC_API_KEY is set — spec §8.1).
      const primary = yield* (
        Effect.gen(function* () {
          const def = yield* p.defaultModel()
          const m = yield* p.getModel(def.providerID, def.modelID)
          const lang = yield* p.getLanguage(m)
          const r: ResolvedModel = {
            model: lang as unknown as LanguageModel,
            providerID: def.providerID,
            modelID: def.modelID,
          }
          return r as ResolvedModel | undefined
        }) as Effect.Effect<ResolvedModel | undefined, unknown, never>
      ).pipe(Effect.catch(() => Effect.succeed(undefined as ResolvedModel | undefined)))
      if (primary) return primary

      // Fallback: DeepSeek (national-compliance / resilience path).
      const fallback = yield* resolveDeepSeekFallback
      if (fallback) return fallback

      return yield* Effect.fail(new NoModelAvailableError("no LLM model available"))
    }) as Effect.Effect<ResolvedModel, NoModelAvailableError, never>,
  )

// ---------- the generate-text driver (injectable for hermetic tests) ----------

// The minimal slice of an `ai` GenerateText result this loop reads. The
// real `generateText` returns a superset; the test fakes exactly this.
export interface LoopStepUsage {
  totalTokens?: number
}

export interface LoopToolResult {
  toolName: string
  // The atomic tool's ExecuteResult (or `output` string); we read
  // `metadata` + `output`.
  output: unknown
}

export interface LoopResult {
  steps: number
  totalTokens: number
  toolResults: LoopToolResult[]
}

export interface DriveLoopArgs {
  model: LanguageModel
  system: string[]
  userMessage: string
  tools: ToolSet
  maxSteps: number
  abort: AbortSignal
}

export type LoopDriver = (args: DriveLoopArgs) => Promise<LoopResult>

const defaultDriveLoop: LoopDriver = async (args) => {
  const result = await generateText({
    model: args.model,
    system: args.system.join("\n\n"),
    messages: [{ role: "user", content: args.userMessage }],
    tools: args.tools,
    stopWhen: stepCountIs(args.maxSteps),
    abortSignal: args.abort,
  })

  const steps = Array.isArray(result.steps) ? result.steps.length : 0
  // Prefer the SDK's accumulated total; fall back to per-step sum.
  let totalTokens = result.totalUsage?.totalTokens ?? 0
  if (!totalTokens && Array.isArray(result.steps)) {
    totalTokens = result.steps.reduce((acc, s) => acc + ((s.usage as LoopStepUsage)?.totalTokens ?? 0), 0)
  }

  const toolResults: LoopToolResult[] = []
  const collect = (trs: ReadonlyArray<{ toolName: string; output: unknown }> | undefined) => {
    if (!trs) return
    for (const tr of trs) toolResults.push({ toolName: tr.toolName, output: tr.output })
  }
  if (Array.isArray(result.steps)) {
    for (const s of result.steps) collect(s.toolResults as ReadonlyArray<{ toolName: string; output: unknown }>)
  } else {
    collect(result.toolResults as ReadonlyArray<{ toolName: string; output: unknown }>)
  }

  return { steps: steps || toolResults.length, totalTokens, toolResults }
}

// ---------- normalization of an atomic tool's ExecuteResult ----------

type NormalizedTerminal =
  | { kind: "placeholder"; url: string }
  | { kind: "url"; url: string }
  | { kind: "error"; message: string }
  | { kind: "none" }

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined
}

// Reads one atomic-tool ExecuteResult ({ title, output, metadata }) and
// classifies it. Order matters: the music placeholder rule (spec §15
// row 1.13) MUST win before any failure mapping.
function normalizeToolResult(output: unknown): NormalizedTerminal {
  const res = asRecord(output)
  if (!res) {
    // Some tools surface a bare string output (no metadata wrapper).
    if (typeof output === "string" && output.length > 0) return { kind: "url", url: output }
    return { kind: "none" }
  }
  const meta = asRecord(res.metadata) ?? {}
  const out = res.output

  // 1. DEFERRED SUCCESS — generate-music-suno placeholder. NOT a failure.
  if (meta.placeholder === true) {
    return { kind: "placeholder", url: typeof out === "string" ? out : String(out ?? "") }
  }

  // 2. Unrecoverable tool failure (one-shot, no internal retry — §5.2).
  if (meta.error === true) {
    const msg = typeof meta.message === "string" ? meta.message : typeof out === "string" ? out : "atomic tool failed"
    return { kind: "error", message: msg }
  }

  // 3. Success — terminal URL = metadata.ossUrl if present, else `output`
  //    (oss-put / generate-sfx-elevenlabs / cg-render put the OSS https
  //    url directly in `output`).
  if (typeof meta.ossUrl === "string" && meta.ossUrl.length > 0) {
    return { kind: "url", url: meta.ossUrl }
  }
  if (typeof out === "string" && out.length > 0) {
    return { kind: "url", url: out }
  }
  return { kind: "none" }
}

// ---------- synthetic Tool.Context ----------

function syntheticContext(jobId: string, abort: AbortSignal): Tool.Context {
  return {
    // Branded ids are only used as span-attribute strings; a stable
    // job-derived value is sufficient and avoids id generator coupling.
    sessionID: `session_${jobId}` as unknown as SessionID,
    messageID: `message_${jobId}` as unknown as MessageID,
    agent: "build",
    abort,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

// ---------- factory ----------

// Assembles the AI ToolSet for an allowlist. Default materializes real
// atomic-tool Defs through the runtime; tests inject a fake that returns
// stub tools keyed by the same allowlist (so allowlist-exposure can still
// be asserted without AppRuntime).
export type BuildTools = (args: {
  allowlist: string[]
  model: LanguageModel
  jobId: string
  abort: AbortSignal
}) => Promise<ToolSet>

export interface LlmGeneratorOverrides {
  loadSkill?: (skill: string) => Promise<LoadedSkill>
  resolveModel?: () => Promise<ResolvedModel>
  // Run an Effect → Promise. Defaults to the full-layer AppRuntime so
  // Provider / ToolRegistry / Truncate / Agent / OSS etc. are available.
  // Tests inject a no-AppRuntime runner.
  runtime?: <A>(effect: Effect.Effect<A, unknown, never>) => Promise<A>
  // Override AI ToolSet assembly. Defaults to materializing real atomic
  // tools via the runtime; tests inject a stub so no AppRuntime is needed.
  buildTools?: BuildTools
  // Drives the actual LLM tool-calling loop. Defaults to ai's
  // generateText; tests inject a deterministic fake (no network).
  driveLoop?: LoopDriver
}

const SYSTEM_LOOP_INSTRUCTION =
  "You produce exactly one asset for this job. Use ONLY the provided tools — no others exist. " +
  "Follow the skill instructions below to choose tools and assemble their inputs. " +
  "When the asset is ready as an OSS https URL, stop (do not keep calling tools). " +
  "If the request is internally inconsistent or infeasible, stop without producing an asset."

export function createLlmGenerator(overrides: LlmGeneratorOverrides = {}): AssetGenerator {
  const loadSkill = overrides.loadSkill ?? defaultLoadSkill
  const resolveModel = overrides.resolveModel ?? defaultResolveModel
  const runtime =
    overrides.runtime ?? (<A>(effect: Effect.Effect<A, unknown, never>) => AppRuntime.runPromise(effect as never))
  const buildTools: BuildTools =
    overrides.buildTools ??
    ((a) => buildToolSet(a.allowlist, a.model, a.jobId, a.abort, runtime))
  const driveLoop = overrides.driveLoop ?? defaultDriveLoop

  return {
    async generate(input: AssetGeneratorInput): Promise<GenerationOutcome> {
      const abort = new AbortController().signal

      // ---- 1. skill body + allowlist ----
      let loaded: LoadedSkill
      try {
        loaded = await loadSkill(input.skill)
      } catch (e) {
        return {
          ok: false,
          code: "GENERATION_REJECTED",
          message: e instanceof Error ? e.message : `skill "${input.skill}" is infeasible`,
          langfuse_trace_id: null,
        }
      }

      // ---- 2. model (Claude primary, DeepSeek fallback) ----
      let resolved: ResolvedModel
      try {
        resolved = await resolveModel()
      } catch (e) {
        return {
          ok: false,
          code: "GENERATION_REJECTED",
          message: e instanceof Error ? e.message : "no LLM model available",
          langfuse_trace_id: null,
        }
      }

      // ---- 3. build the AI tool set from the allowlist (only) ----
      let tools: ToolSet
      try {
        tools = await buildTools({
          allowlist: loaded.allowlist,
          model: resolved.model,
          jobId: input.job_id,
          abort,
        })
      } catch (e) {
        return {
          ok: false,
          code: "GENERATION_REJECTED",
          message: e instanceof Error ? e.message : "failed to assemble atomic tools",
          langfuse_trace_id: null,
        }
      }

      // ---- 4. run the generic loop ----
      const userMessage = JSON.stringify(
        {
          intent: {
            kind: input.intent.kind,
            key: input.intent.key,
            spec_md: input.intent.spec_md,
            refs: input.intent.refs ?? [],
            constraints: input.intent.constraints ?? {},
            name: input.intent.name ?? null,
          },
          preferences: input.preferences ?? {},
        },
        null,
        2,
      )

      let loop: LoopResult
      try {
        loop = await driveLoop({
          model: resolved.model,
          system: [SYSTEM_LOOP_INSTRUCTION, loaded.body],
          userMessage,
          tools,
          maxSteps: input.maxSteps,
          abort,
        })
      } catch (e) {
        // An LLM/transport error after a model was resolved → treat the
        // job as not generatable (spec infeasible at this time), not a 500.
        return {
          ok: false,
          code: "GENERATION_REJECTED",
          message: e instanceof Error ? e.message : "LLM loop failed",
          langfuse_trace_id: null,
        }
      }

      const steps = loop.steps
      const maxTokens = resolveMaxTokensPerJob()

      // ---- 5. terminal-outcome mapping ----
      // Scan tool results newest-first so the LAST terminal result wins.
      // The music-placeholder rule short-circuits BEFORE any failure
      // mapping and BEFORE the budget check (a deferred success is still
      // a success — §15 row 1.13 / D6).
      let lastError: string | undefined
      let lastUrl: { url: string; tool: string } | undefined
      for (let i = loop.toolResults.length - 1; i >= 0; i--) {
        const tr = loop.toolResults[i]
        const norm = normalizeToolResult(tr.output)
        if (norm.kind === "placeholder") {
          return {
            ok: true,
            atomic_tool: tr.toolName,
            url: norm.url,
            ref_urls: input.intent.refs ?? [],
            steps,
            langfuse_trace_id: null,
          }
        }
        if (norm.kind === "url" && !lastUrl) {
          lastUrl = { url: norm.url, tool: tr.toolName }
        }
        if (norm.kind === "error" && !lastError) {
          lastError = norm.message
        }
      }

      if (lastUrl) {
        return {
          ok: true,
          atomic_tool: lastUrl.tool,
          url: lastUrl.url,
          ref_urls: input.intent.refs ?? [],
          steps,
          langfuse_trace_id: null,
        }
      }

      // No usable terminal URL. Budget backstops first: a runaway loop
      // that burned the step or token budget without producing a URL is
      // BUDGET_EXCEEDED (the two backstops are independent — D7).
      if (loop.totalTokens > maxTokens) {
        return {
          ok: false,
          code: "BUDGET_EXCEEDED",
          message: `token budget exceeded: used ${loop.totalTokens} > limit ${maxTokens}`,
          steps,
          langfuse_trace_id: null,
        }
      }
      if (steps >= input.maxSteps) {
        return {
          ok: false,
          code: "BUDGET_EXCEEDED",
          message: `step budget exhausted (${steps}/${input.maxSteps}) without a terminal asset`,
          steps,
          langfuse_trace_id: null,
        }
      }

      // A tool ran and failed unrecoverably (one-shot, no internal retry).
      if (lastError) {
        return {
          ok: false,
          code: "ATOMIC_TOOL_FAILED",
          message: lastError,
          steps,
          langfuse_trace_id: null,
        }
      }

      // The model produced no usable tool output at all → the spec was
      // effectively not generatable as asked.
      return {
        ok: false,
        code: "GENERATION_REJECTED",
        message: "the model produced no usable atomic-tool output",
        steps,
        langfuse_trace_id: null,
      }
    },
  }
}

// ---------- AI tool set assembly ----------
//
// Only allowlisted tools are ever materialized into the `ToolSet` handed
// to the model — a non-allowlisted tool is structurally unreachable
// (T7: it cannot be called because it is not exposed).

interface ResolvedDef {
  description: string
  schema: unknown
  execute: (args: unknown, ctx: Tool.Context) => Effect.Effect<unknown, unknown, never>
}

async function buildToolSet(
  allowlist: string[],
  model: LanguageModel,
  jobId: string,
  abort: AbortSignal,
  runtime: <A>(effect: Effect.Effect<A, unknown, never>) => Promise<A>,
): Promise<ToolSet> {
  const set: ToolSet = {}
  for (const id of allowlist) {
    const infoEffect = ATOMIC_TOOLS[id]
    if (!infoEffect) continue // defensive; parseAllowlist already filters

    // Resolve the Tool.Info (needs Truncate + Agent — provided by the
    // runtime) then Tool.init → callable Def, all in one Effect.
    const resolveDef: Effect.Effect<ResolvedDef, unknown, never> = Effect.gen(function* () {
      const info = yield* infoEffect
      const def = yield* Tool.init(info)
      const schema = ProviderTransform.schema(
        // ProviderTransform.schema only reads providerID/api/id; the bound
        // AI-SDK model is opaque, so a minimal shim makes the call
        // type-safe and the JSON Schema is returned as-is (provider-
        // specific rewrites for moonshot/gemini simply do not fire — the
        // asset tools never run under those here).
        schemaModelShim(model),
        EffectZod.toJsonSchema(def.parameters as never),
      )
      const resolved: ResolvedDef = {
        description: def.description,
        schema,
        execute: (args, ctx) => def.execute(args as never, ctx) as Effect.Effect<unknown, unknown, never>,
      }
      return resolved
    }) as unknown as Effect.Effect<ResolvedDef, unknown, never>

    const def = await runtime(resolveDef)

    set[id] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.schema as Record<string, unknown>),
      execute: async (rawArgs: unknown) => {
        const ctx = syntheticContext(jobId, abort)
        return runtime(def.execute(rawArgs, ctx))
      },
    })
  }
  return set
}

// ProviderTransform.schema is keyed on model.providerID / model.api.id.
// A bound LanguageModel from the AI SDK is opaque (no such fields); the
// only consequence is that the moonshot/gemini schema rewrites do not
// fire — correct, since asset tools never run under those here. This shim
// keeps the call type-safe without re-deriving the full Provider.Model.
function schemaModelShim(_model: LanguageModel): Parameters<typeof ProviderTransform.schema>[0] {
  return {
    providerID: "",
    api: { id: "", url: "", npm: "" },
  } as unknown as Parameters<typeof ProviderTransform.schema>[0]
}
