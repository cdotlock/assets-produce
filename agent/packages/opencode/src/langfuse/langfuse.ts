import { Effect, Layer, Context } from "effect"
import { Langfuse } from "langfuse"
import { NamedError } from "@opencode-ai/core/util/error"
import * as Log from "@opencode-ai/core/util/log"
import { z } from "zod"

const log = Log.create({ service: "langfuse" })

export const LangfuseError = NamedError.create(
  "LangfuseError",
  z.object({
    op: z.string(),
    target: z.string().optional(),
    message: z.string(),
  }),
)
export type LangfuseError = InstanceType<typeof LangfuseError>

export interface PromptInfo {
  name: string
  version: number
  label: string
  body: string
  type: "text" | "chat"
}

export interface CreatePromptOpts {
  label?: string
  tags?: readonly string[]
  commitMessage?: string
}

export interface Interface {
  readonly getPrompt: (name: string, opts?: { label?: string; version?: number }) => Effect.Effect<PromptInfo, LangfuseError>
  readonly createPrompt: (
    name: string,
    body: string,
    opts?: CreatePromptOpts,
  ) => Effect.Effect<PromptInfo, LangfuseError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/Langfuse") {}

function readEnv(): Effect.Effect<{ host: string; publicKey: string; secretKey: string }, LangfuseError> {
  return Effect.gen(function* () {
    const host = process.env.LANGFUSE_HOST ?? "https://prompt.mobai-game.com"
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY
    const secretKey = process.env.LANGFUSE_SECRET_KEY
    if (!publicKey || !secretKey) {
      const missing = [!publicKey && "LANGFUSE_PUBLIC_KEY", !secretKey && "LANGFUSE_SECRET_KEY"].filter(Boolean) as string[]
      return yield* Effect.fail(
        new LangfuseError({
          op: "env",
          message: `Langfuse env missing: ${missing.join(", ")}`,
        }),
      )
    }
    return { host, publicKey, secretKey }
  })
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const env = yield* readEnv()
    const client = new Langfuse({
      baseUrl: env.host,
      publicKey: env.publicKey,
      secretKey: env.secretKey,
    })
    log.info("langfuse client ready", { host: env.host })

    return Service.of({
      getPrompt: (name, opts) =>
        Effect.tryPromise({
          try: async () => {
            const prompt = await client.getPrompt(name, opts?.version, {
              label: opts?.label,
            })
            const body = typeof prompt.prompt === "string" ? prompt.prompt : JSON.stringify(prompt.prompt)
            return {
              name: prompt.name,
              version: prompt.version,
              label: opts?.label ?? "production",
              body,
              type: prompt.type as "text" | "chat",
            }
          },
          catch: (cause) =>
            new LangfuseError({
              op: "getPrompt",
              target: name,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
        }),
      createPrompt: (name, body, opts) =>
        Effect.tryPromise({
          try: async () => {
            const created = await client.createPrompt({
              name,
              prompt: body,
              type: "text",
              labels: opts?.label ? [opts.label] : undefined,
              tags: opts?.tags ? [...opts.tags] : undefined,
              commitMessage: opts?.commitMessage,
            })
            const text = typeof created.prompt === "string" ? created.prompt : JSON.stringify(created.prompt)
            return {
              name: created.name,
              version: created.version,
              label: opts?.label ?? "production",
              body: text,
              type: "text" as const,
            }
          },
          catch: (cause) =>
            new LangfuseError({
              op: "createPrompt",
              target: name,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
        }),
    })
  }),
)

export const defaultLayer = layer
