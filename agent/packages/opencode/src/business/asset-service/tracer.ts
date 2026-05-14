// Phase 8 trace abstraction. The asset-service mini agent loop emits a
// per-job trace so operators can see "what did the LLM do for THIS job" in
// Langfuse / a similar observability surface.
//
// The Tracer interface is intentionally minimal — the production
// implementation (createLangfuseTracer) writes to Langfuse via its SDK,
// tests inject a recordingTracer, and the default nullTracer is a no-op
// (which is what unit-tested runJob calls go through when no tracer is
// wired). The terminal langfuse_trace_id surface on AssetJob.row is what
// downstream observers correlate with.

import type { AssetGeneratorInput, GenerationOutcome } from "./run-asset-generation"

export interface JobTrace {
  /** Stable id for this trace; persisted on AssetJob.langfuse_trace_id. */
  readonly id: string
  /** Record a sub-event inside the trace (skill picked, atomic tool called, …). */
  event(name: string, data: unknown): void
  /** Close the trace; data is the terminal projection of the job. */
  end(data: TraceEnd): void
}

export interface TraceEnd {
  status: "succeeded" | "failed"
  asset_id?: string
  url?: string
  error?: { code: string; message: string }
  steps?: number
}

export interface Tracer {
  startJob(input: AssetGeneratorInput): JobTrace
}

// ---------- default no-op tracer ----------

const NO_OP_TRACE: JobTrace = {
  id: "",
  event() {
    // no-op
  },
  end() {
    // no-op
  },
}

export const nullTracer: Tracer = {
  startJob() {
    return NO_OP_TRACE
  },
}

// ---------- Langfuse-backed tracer (production) ----------
//
// Optional — when the env vars LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY
// are present, createLangfuseTracer returns a Tracer that posts each job
// to Langfuse. Otherwise it falls back to nullTracer so dev / CI without
// keys keeps running without crashing. The Langfuse SDK is imported
// lazily so this file stays cheap to import in tests.

export interface LangfuseTracerEnv {
  host?: string
  publicKey?: string
  secretKey?: string
  project?: string
}

export interface LangfuseTracerOptions {
  env?: LangfuseTracerEnv
  // Override for tests — bypasses the SDK and lets a fake "client" record
  // calls. Public only so the test suite can pin the exact contract; do
  // NOT use from production code.
  __clientForTest?: unknown
}

export function createLangfuseTracer(opts: LangfuseTracerOptions = {}): Tracer {
  const env = opts.env ?? readLangfuseEnv()
  // Without both keys we cannot push to Langfuse — silently no-op so the
  // mini agent loop still completes locally (jobs just won't show up in
  // the LF UI).
  if (!opts.__clientForTest && (!env.publicKey || !env.secretKey)) {
    return nullTracer
  }

  // Lazily resolve the SDK; the test override path skips this.
  const buildTrace = (input: AssetGeneratorInput): JobTrace => {
    const start: TraceClient | null = buildLangfuseTraceClient(opts, env, input)
    if (!start) return NO_OP_TRACE
    return {
      id: start.id,
      event(name, data) {
        start.event(name, data)
      },
      end(data) {
        start.end(data)
      },
    }
  }

  return {
    startJob(input) {
      try {
        return buildTrace(input)
      } catch {
        // Never let a tracing failure break the request.
        return NO_OP_TRACE
      }
    },
  }
}

function readLangfuseEnv(): LangfuseTracerEnv {
  const env = process.env
  return {
    host: env.LANGFUSE_HOST ?? "https://prompt.mobai-game.com",
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    project: env.LANGFUSE_PROJECT ?? "assets-produce",
  }
}

interface TraceClient {
  readonly id: string
  event(name: string, data: unknown): void
  end(data: TraceEnd): void
}

interface LangfuseSdkLike {
  trace(args: { name: string; input?: unknown; metadata?: unknown; tags?: string[] }): {
    id: string
    event(args: { name: string; output?: unknown }): void
    update(args: { output?: unknown }): void
  }
}

function buildLangfuseTraceClient(
  opts: LangfuseTracerOptions,
  env: LangfuseTracerEnv,
  input: AssetGeneratorInput,
): TraceClient | null {
  let client: LangfuseSdkLike
  if (opts.__clientForTest) {
    client = opts.__clientForTest as LangfuseSdkLike
  } else {
    // Resolve the SDK at call time; require is wrapped in try so missing
    // dep can't break unrelated callers. The "langfuse" package is
    // already a dep of @opencode-ai/opencode (used by langfuse/langfuse.ts).
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("langfuse") as { Langfuse: new (cfg: Record<string, unknown>) => LangfuseSdkLike }
      client = new mod.Langfuse({
        baseUrl: env.host,
        publicKey: env.publicKey,
        secretKey: env.secretKey,
      })
    } catch {
      return null
    }
  }
  const t = client.trace({
    name: "asset-service.runJob",
    input: { intent: input.intent, skill: input.skill, preferences: input.preferences },
    metadata: { job_id: input.job_id, project_id: input.project_id, max_steps: input.maxSteps },
    tags: ["asset-service", `skill:${input.skill}`, `kind:${input.intent.kind}`],
  })
  return {
    id: t.id,
    event(name, data) {
      t.event({ name, output: data })
    },
    end(data) {
      t.update({ output: data })
    },
  }
}

// ---------- helpers for production wiring ----------

export interface BuildTraceEndArgs {
  outcome?: GenerationOutcome
  asset_id?: string | null
  failure?: { code: string; message: string }
}

export function buildTraceEnd(args: BuildTraceEndArgs): TraceEnd {
  if (args.outcome?.ok) {
    return {
      status: "succeeded",
      asset_id: args.asset_id ?? undefined,
      url: args.outcome.url,
      steps: args.outcome.steps,
    }
  }
  // either outcome.ok === false OR no outcome (skill-pick failure etc.)
  const code = args.failure?.code ?? (args.outcome && !args.outcome.ok ? args.outcome.code : "INTERNAL")
  const message =
    args.failure?.message ?? (args.outcome && !args.outcome.ok ? args.outcome.message : "unknown failure")
  return {
    status: "failed",
    error: { code, message },
    steps: args.outcome && !args.outcome.ok ? args.outcome.steps : undefined,
  }
}
