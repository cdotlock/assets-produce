import { Effect, Layer, Context, Schema } from "effect"
import OSSClient from "ali-oss"
import { NamedError } from "@opencode-ai/core/util/error"
import * as Log from "@opencode-ai/core/util/log"
import { z } from "zod"

const log = Log.create({ service: "oss" })

export const OSSError = NamedError.create(
  "OSSError",
  z.object({
    op: z.string(),
    key: z.string().optional(),
    message: z.string(),
  }),
)
export type OSSError = InstanceType<typeof OSSError>

export interface PutResult {
  key: string
  url: string
  etag?: string
}

export interface ListResult {
  keys: string[]
  prefix?: string
  nextMarker?: string
}

export interface Interface {
  readonly put: (key: string, body: Buffer | string) => Effect.Effect<PutResult, OSSError>
  readonly get: (key: string) => Effect.Effect<Buffer, OSSError>
  readonly list: (opts?: { prefix?: string; marker?: string; maxKeys?: number }) => Effect.Effect<ListResult, OSSError>
  readonly delete: (key: string) => Effect.Effect<void, OSSError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/OSS") {}

const Env = Schema.Struct({
  region: Schema.String,
  accessKeyId: Schema.String,
  accessKeySecret: Schema.String,
  bucket: Schema.String,
  endpoint: Schema.optional(Schema.String),
})

function readEnv(): Effect.Effect<Schema.Schema.Type<typeof Env>, OSSError> {
  return Effect.gen(function* () {
    const region = process.env.OSS_REGION
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET
    const bucket = process.env.OSS_BUCKET
    const endpoint = process.env.OSS_ENDPOINT
    const missing = [
      !region && "OSS_REGION",
      !accessKeyId && "OSS_ACCESS_KEY_ID",
      !accessKeySecret && "OSS_ACCESS_KEY_SECRET",
      !bucket && "OSS_BUCKET",
    ].filter(Boolean) as string[]
    if (missing.length) {
      return yield* Effect.fail(
        new OSSError({
          op: "env",
          message: `OSS env missing: ${missing.join(", ")}`,
        }),
      )
    }
    return {
      region: region!,
      accessKeyId: accessKeyId!,
      accessKeySecret: accessKeySecret!,
      bucket: bucket!,
      endpoint,
    }
  })
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const env = yield* readEnv()
    const client = new OSSClient({
      region: env.region,
      accessKeyId: env.accessKeyId,
      accessKeySecret: env.accessKeySecret,
      bucket: env.bucket,
      endpoint: env.endpoint,
    })
    log.info("oss client ready", { bucket: env.bucket, region: env.region })

    const wrap = <A>(op: string, key: string | undefined, fn: () => Promise<A>) =>
      Effect.tryPromise({
        try: fn,
        catch: (cause) =>
          new OSSError({
            op,
            key,
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      })

    return Service.of({
      put: (key, body) =>
        wrap("put", key, async () => {
          const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body
          const res = await client.put(key, buf)
          return {
            key,
            url: res.url,
            etag: (res.res?.headers as Record<string, string> | undefined)?.etag,
          }
        }),
      get: (key) =>
        wrap("get", key, async () => {
          const res = await client.get(key)
          if (Buffer.isBuffer(res.content)) return res.content
          if (res.content instanceof Uint8Array) return Buffer.from(res.content)
          if (typeof res.content === "string") return Buffer.from(res.content, "utf8")
          throw new Error(`unexpected content type from OSS: ${typeof res.content}`)
        }),
      list: (opts) =>
        wrap("list", undefined, async () => {
          // ali-oss SDK rejects an explicit `undefined` for `marker` even
          // though TS marks it optional; build the query without undefined keys.
          const query = {
            "max-keys": opts?.maxKeys ?? 100,
            ...(opts?.prefix !== undefined && { prefix: opts.prefix }),
            ...(opts?.marker !== undefined && { marker: opts.marker }),
          }
          const res = await client.list(query, {})
          return {
            keys: (res.objects ?? []).map((o) => o.name),
            prefix: opts?.prefix,
            nextMarker: res.nextMarker,
          }
        }),
      delete: (key) =>
        wrap("delete", key, async () => {
          await client.delete(key)
        }),
    })
  }),
)

export const defaultLayer = layer
