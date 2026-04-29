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

import type { SkillError } from "./skill"
import type { LangfuseError } from "@/langfuse/langfuse"

export interface Interface {
  readonly list: (filter?: { scope?: Scope; enabledOnly?: boolean }) => Effect.Effect<ManagedInfo[], SkillError>
  readonly getInfo: (name: string) => Effect.Effect<ManagedInfo | undefined, SkillError>
  readonly loadBody: (name: string) => Effect.Effect<string | undefined, SkillError | LangfuseError>
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

    const rowToInfo = (r: {
      name: string
      description: string
      scope: Scope
      enabled: boolean
      langfuse_prompt_key: string
      langfuse_label: string
    }): ManagedInfo => ({
      name: r.name,
      description: r.description,
      scope: r.scope,
      enabled: r.enabled,
      langfusePromptKey: r.langfuse_prompt_key,
      langfuseLabel: r.langfuse_label,
    })

    const list: Interface["list"] = (filter) => skillSvc.list(filter).pipe(Effect.map((rows) => rows.map(rowToInfo)))

    const getInfo: Interface["getInfo"] = (name) =>
      skillSvc.getByName(name).pipe(Effect.map((row) => (row ? rowToInfo(row) : undefined)))

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
      })

    return Service.of({ list, getInfo, loadBody })
  }),
)

export const layer = dbOnlyLayer

export const defaultLayer = layer.pipe(Layer.provide(skillBusinessLayer), Layer.provide(safeLangfuseLayer))

export * as SkillManaged from "./managed"
