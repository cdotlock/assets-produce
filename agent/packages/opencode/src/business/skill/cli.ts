import { Effect } from "effect"
import * as fs from "fs/promises"
import * as dns from "dns/promises"
import * as net from "net"
import { Service as SkillService, type Scope } from "./skill"
import { Service as LangfuseService } from "@/langfuse/langfuse"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

const NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/
const URL_PATTERN = /^https:\/\/.+/i
const MAX_BODY_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 10_000

function isPrivateOrLoopbackAddr(addr: string): boolean {
  if (!net.isIP(addr)) return false
  if (net.isIPv4(addr)) {
    const parts = addr.split(".").map(Number)
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
    const [a, b] = parts as [number, number, number, number]
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 0) return true
    if (a >= 224) return true
    return false
  }
  const lower = addr.toLowerCase()
  if (lower === "::1" || lower === "::") return true
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true
  if (lower.startsWith("ff")) return true
  if (lower.startsWith("::ffff:")) {
    return isPrivateOrLoopbackAddr(lower.slice(7))
  }
  return false
}

export const SkillCliError = NamedError.create(
  "SkillCliError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type SkillCliError = InstanceType<typeof SkillCliError>

export function promptKeyFor(name: string): string {
  return `skill_${name}`
}

function validateName(name: string): Effect.Effect<void, SkillCliError> {
  if (!NAME_PATTERN.test(name))
    return Effect.fail(
      new SkillCliError({
        op: "validate",
        message: `name must match ${NAME_PATTERN.source} (got: ${name})`,
      }),
    )
  return Effect.void
}

function validateDescription(description: string): Effect.Effect<void, SkillCliError> {
  if (description.length < 1 || description.length > 500)
    return Effect.fail(
      new SkillCliError({ op: "validate", message: "description must be 1-500 chars" }),
    )
  return Effect.void
}

async function fetchUrlBody(url: string): Promise<string> {
  if (!URL_PATTERN.test(url)) throw new Error(`url must be https:// (got ${url})`)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`invalid url: ${url}`)
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "")
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }]
    : await dns.lookup(hostname, { all: true })
  for (const a of addresses) {
    if (isPrivateOrLoopbackAddr(a.address)) {
      throw new Error(`blocked: hostname resolves to private/loopback address ${a.address}`)
    }
  }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(new Error(`fetch timeout after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "manual" })
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`redirect (${res.status}) blocked for safety; provide the canonical https URL directly`)
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const reader = res.body?.getReader()
    if (!reader) {
      const text = await res.text()
      if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Error(`body too large (>1MB)`)
      return text
    }
    const decoder = new TextDecoder()
    let bytes = 0
    let out = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        bytes += value.byteLength
        if (bytes > MAX_BODY_BYTES) throw new Error("body too large (>1MB)")
        out += decoder.decode(value, { stream: true })
      }
    }
    out += decoder.decode()
    return out
  } finally {
    clearTimeout(timer)
  }
}

async function readFileBody(path: string): Promise<string> {
  const stat = await fs.stat(path)
  if (stat.size > MAX_BODY_BYTES) throw new Error(`file too large (>${MAX_BODY_BYTES} bytes)`)
  return fs.readFile(path, "utf8")
}

export type ContentSource =
  | { kind: "file"; path: string }
  | { kind: "url"; url: string }
  | { kind: "langfuse-key"; key: string }
  | { kind: "inline"; body: string }

export interface AddOpts {
  name: string
  description: string
  source: ContentSource
  label?: string
  scope?: Scope
  enabled?: boolean
  attachments?: unknown
  dryRun?: boolean
}

export interface UpdateOpts {
  name: string
  description?: string
  source?: ContentSource
  label?: string
  scope?: Scope
  enabled?: boolean
  attachments?: unknown
  dryRun?: boolean
}

export interface AddResult {
  resolved: {
    name: string
    description: string
    langfusePromptKey: string
    langfuseLabel: string
    scope: Scope
    enabled: boolean
    sourceKind: ContentSource["kind"]
    bodyBytes?: number
  }
  dryRun: boolean
}

const resolveBody = (source: ContentSource): Effect.Effect<string | undefined, SkillCliError> =>
  Effect.tryPromise({
    try: async () => {
      switch (source.kind) {
        case "file":
          return await readFileBody(source.path)
        case "url":
          return await fetchUrlBody(source.url)
        case "inline":
          if (Buffer.byteLength(source.body, "utf8") > MAX_BODY_BYTES) {
            throw new Error(`inline body too large (>${MAX_BODY_BYTES} bytes)`)
          }
          return source.body
        case "langfuse-key":
          return undefined
      }
    },
    catch: (cause) =>
      new SkillCliError({
        op: "resolve-body",
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  })

export const addSkill = (opts: AddOpts) =>
  Effect.gen(function* () {
    yield* validateName(opts.name)
    yield* validateDescription(opts.description)

    const scope: Scope = opts.scope ?? "system"
    const label = opts.label ?? "production"
    const enabled = opts.enabled ?? true
    const promptKey = opts.source.kind === "langfuse-key" ? opts.source.key : promptKeyFor(opts.name)

    const body = yield* resolveBody(opts.source)

    const result: AddResult = {
      resolved: {
        name: opts.name,
        description: opts.description,
        langfusePromptKey: promptKey,
        langfuseLabel: label,
        scope,
        enabled,
        sourceKind: opts.source.kind,
        bodyBytes: body !== undefined ? Buffer.byteLength(body, "utf8") : undefined,
      },
      dryRun: Boolean(opts.dryRun),
    }

    if (opts.dryRun) return result

    const skillSvc = yield* SkillService
    const existing = yield* skillSvc.getByName(opts.name)
    if (existing) {
      return yield* Effect.fail(
        new SkillCliError({
          op: "duplicate",
          message: `skill "${opts.name}" already exists; use 'agent skills update --name ${opts.name} ...' to push a new body`,
        }),
      )
    }

    if (body !== undefined) {
      const langfuse = yield* LangfuseService
      yield* langfuse.createPrompt(promptKey, body, {
        label,
        commitMessage: `skills/add ${opts.name}`,
      })
    }

    yield* skillSvc.create({
      name: opts.name,
      description: opts.description,
      langfusePromptKey: promptKey,
      langfuseLabel: label,
      scope,
      enabled,
      attachments: opts.attachments,
    })

    return result
  })

export const updateSkill = (opts: UpdateOpts) =>
  Effect.gen(function* () {
    yield* validateName(opts.name)
    if (opts.description !== undefined) yield* validateDescription(opts.description)

    const skillSvc = yield* SkillService
    const existing = yield* skillSvc.getByName(opts.name)
    if (!existing)
      return yield* Effect.fail(
        new SkillCliError({ op: "update", message: `skill not found: ${opts.name}` }),
      )

    const body = opts.source ? yield* resolveBody(opts.source) : undefined

    const result = {
      resolved: {
        id: existing.id,
        name: existing.name,
        description: opts.description ?? existing.description,
        langfusePromptKey: existing.langfuse_prompt_key,
        langfuseLabel: opts.label ?? existing.langfuse_label,
        scope: opts.scope ?? existing.scope,
        enabled: opts.enabled ?? existing.enabled,
        sourceKind: opts.source?.kind,
        bodyBytes: body !== undefined ? Buffer.byteLength(body, "utf8") : undefined,
      },
      dryRun: Boolean(opts.dryRun),
    }

    if (opts.dryRun) return result

    if (body !== undefined) {
      const langfuse = yield* LangfuseService
      yield* langfuse.createPrompt(existing.langfuse_prompt_key, body, {
        label: result.resolved.langfuseLabel,
        commitMessage: `skills/update ${opts.name}`,
      })
    }

    yield* skillSvc.update(existing.id, {
      description: opts.description,
      langfuseLabel: opts.label,
      scope: opts.scope,
      enabled: opts.enabled,
      attachments: opts.attachments,
    })

    return result
  })

export const deleteSkill = (name: string) =>
  Effect.gen(function* () {
    yield* validateName(name)
    const skillSvc = yield* SkillService
    const existing = yield* skillSvc.getByName(name)
    if (!existing)
      return yield* Effect.fail(
        new SkillCliError({ op: "delete", message: `skill not found: ${name}` }),
      )
    yield* skillSvc.delete(existing.id)
  })

export const setEnabled = (name: string, enabled: boolean) =>
  Effect.gen(function* () {
    yield* validateName(name)
    const skillSvc = yield* SkillService
    const existing = yield* skillSvc.getByName(name)
    if (!existing)
      return yield* Effect.fail(
        new SkillCliError({ op: "enable", message: `skill not found: ${name}` }),
      )
    return yield* skillSvc.update(existing.id, { enabled })
  })

export const listSkills = (filter?: { scope?: Scope; enabledOnly?: boolean }) =>
  Effect.gen(function* () {
    const skillSvc = yield* SkillService
    return yield* skillSvc.list(filter)
  })

export const showSkill = (name: string) =>
  Effect.gen(function* () {
    yield* validateName(name)
    const skillSvc = yield* SkillService
    const row = yield* skillSvc.getByName(name)
    if (!row) return undefined
    let body: string | undefined
    const langfuseOpt = yield* Effect.serviceOption(LangfuseService)
    if (langfuseOpt._tag === "Some") {
      const lf = langfuseOpt.value
      const prompt = yield* lf
        .getPrompt(row.langfuse_prompt_key, { label: row.langfuse_label })
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      body = prompt?.body
    }
    return { row, body }
  })

export * as SkillCli from "./cli"
