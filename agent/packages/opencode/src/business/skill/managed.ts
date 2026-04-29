import { Effect, Layer, Context } from "effect"
import { Service as SkillService, type Scope, defaultLayer as skillBusinessLayer } from "./skill"
import { Service as LangfuseService, defaultLayer as langfuseLayer } from "@/langfuse/langfuse"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "skill.managed" })

export interface ManagedInfo {
  name: string
  description: string
  scope: Scope
  enabled: boolean
  langfusePromptKey: string
  langfuseLabel: string
}

export interface Interface {
  readonly list: (filter?: { scope?: Scope; enabledOnly?: boolean }) => Effect.Effect<ManagedInfo[]>
  readonly getInfo: (name: string) => Effect.Effect<ManagedInfo | undefined>
  readonly loadBody: (name: string) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/SkillManaged") {}

const safeLangfuseLayer = langfuseLayer.pipe(
  Layer.catchCause((cause) => {
    log.warn("langfuse layer unavailable; managed.loadBody will degrade", {
      cause: String(cause).slice(0, 200),
    })
    return Layer.empty
  }),
)

const dbOnlyLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skillSvc = yield* SkillService
    const langfuseOpt = yield* Effect.serviceOption(LangfuseService)

    const list: Interface["list"] = (filter) =>
      skillSvc.list(filter).pipe(
        Effect.map((rows) =>
          rows.map((r) => ({
            name: r.name,
            description: r.description,
            scope: r.scope,
            enabled: r.enabled,
            langfusePromptKey: r.langfuse_prompt_key,
            langfuseLabel: r.langfuse_label,
          })),
        ),
        Effect.catch((err) => {
          log.error("managed.list failed", { err })
          return Effect.succeed([] as ManagedInfo[])
        }),
      )

    const getInfo: Interface["getInfo"] = (name) =>
      skillSvc.getByName(name).pipe(
        Effect.map((row) =>
          row
            ? {
                name: row.name,
                description: row.description,
                scope: row.scope,
                enabled: row.enabled,
                langfusePromptKey: row.langfuse_prompt_key,
                langfuseLabel: row.langfuse_label,
              }
            : undefined,
        ),
        Effect.catch((err) => {
          log.error("managed.getInfo failed", { err, name })
          return Effect.succeed(undefined)
        }),
      )

    const loadBody: Interface["loadBody"] = (name) =>
      Effect.gen(function* () {
        if (langfuseOpt._tag !== "Some") {
          log.warn("managed.loadBody: langfuse unavailable", { name })
          return undefined
        }
        const info = yield* getInfo(name)
        if (!info) return undefined
        const prompt = yield* langfuseOpt.value.getPrompt(info.langfusePromptKey, { label: info.langfuseLabel })
        return prompt.body
      }).pipe(
        Effect.catch((err) => {
          log.error("managed.loadBody failed", { err, name })
          return Effect.succeed(undefined)
        }),
      )

    return Service.of({ list, getInfo, loadBody })
  }),
)

export const layer = dbOnlyLayer

export const defaultLayer = layer.pipe(Layer.provide(skillBusinessLayer), Layer.provide(safeLangfuseLayer))

export * as SkillManaged from "./managed"
