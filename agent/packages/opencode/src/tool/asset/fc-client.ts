import { Effect } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const FcCallError = NamedError.create(
  "FcCallError",
  z.object({
    tool: z.string(),
    op: z.string(),
    status: z.number().optional(),
    message: z.string(),
  }),
)
export type FcCallError = InstanceType<typeof FcCallError>

export interface FcEndpoint {
  url: string
  token: string
}

export function readEndpoint(tool: string, urlEnv: string, tokenEnv: string): FcEndpoint {
  const url = process.env[urlEnv]
  const token = process.env[tokenEnv]
  if (!url || !token) {
    throw new FcCallError({
      tool,
      op: "config",
      message: `${urlEnv} / ${tokenEnv} are not configured (set both to enable this tool)`,
    })
  }
  return { url, token }
}

export interface CallOpts {
  tool: string
  endpoint: FcEndpoint
  body: Record<string, unknown>
  timeoutMs: number
  signal?: AbortSignal
}

export const callFc = <T>(opts: CallOpts) =>
  Effect.tryPromise({
    try: async () => {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(new Error(`fc call timed out after ${opts.timeoutMs}ms`)), opts.timeoutMs)
      const composed = opts.signal
        ? AbortSignal.any([opts.signal, ctl.signal])
        : ctl.signal
      try {
        const res = await fetch(opts.endpoint.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${opts.endpoint.token}`,
          },
          body: JSON.stringify(opts.body),
          signal: composed,
        })
        const text = await res.text()
        if (!res.ok) {
          throw new FcCallError({
            tool: opts.tool,
            op: "http",
            status: res.status,
            message: text || res.statusText,
          })
        }
        const parsed: unknown = text ? JSON.parse(text) : {}
        return parsed as T
      } finally {
        clearTimeout(timer)
      }
    },
    catch: (cause) => {
      if (cause instanceof FcCallError) return cause
      const message = cause instanceof Error ? cause.message : String(cause)
      return new FcCallError({ tool: opts.tool, op: "fetch", message })
    },
  })

export function formatToolError(err: unknown): string {
  if (err instanceof FcCallError) {
    const { op, status, message } = err.data
    return status !== undefined ? `[${op}/${status}] ${message}` : `[${op}] ${message}`
  }
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: unknown }).data
    if (data && typeof data === "object") {
      const { op, status, message } = data as { op?: unknown; status?: unknown; message?: unknown }
      const opStr = typeof op === "string" ? op : "error"
      const msgStr = typeof message === "string" ? message : JSON.stringify(data).slice(0, 256)
      return typeof status === "number" ? `[${opStr}/${status}] ${msgStr}` : `[${opStr}] ${msgStr}`
    }
  }
  if (err instanceof Error) return err.name === err.message ? err.name : err.message
  return String(err)
}

export function extractUrlFromResult(
  tool: string,
  raw: unknown,
  fields: readonly string[],
): Effect.Effect<string, FcCallError> {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    for (const field of fields) {
      const value = obj[field]
      if (typeof value === "string" && /^https?:\/\//i.test(value)) return Effect.succeed(value)
    }
  }
  return Effect.fail(
    new FcCallError({
      tool,
      op: "parse",
      message: `expected one of [${fields.join(", ")}] in response, got: ${JSON.stringify(raw).slice(0, 256)}`,
    }),
  )
}
