import type { Argv } from "yargs"
import { Cause, Effect, Exit } from "effect"
import { Instance } from "../../project/instance"
import { AppRuntime } from "@/effect/app-runtime"
import {
  SkillCli,
  type ContentSource,
} from "@/business/skill/cli"
import { Service as SkillService, type Scope } from "@/business/skill/skill"
import { Service as LangfuseService } from "@/langfuse/langfuse"
import { Skill as SkillIndex } from "@/skill"
import { defaultLayer as skillBusinessLayer } from "@/business/skill/skill"
import { defaultLayer as langfuseLayer } from "@/langfuse/langfuse"
import { Layer } from "effect"
import { cmd } from "./cmd"
import { UI } from "../ui"

function writeOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

const ScopeChoices = ["system", "creator"] as const

function provideSkillsLayer<A, E>(eff: Effect.Effect<A, E, SkillService | LangfuseService>): Effect.Effect<A, E> {
  return eff.pipe(Effect.provide(Layer.mergeAll(skillBusinessLayer, langfuseLayer))) as Effect.Effect<A, E>
}

async function runWithLayers<A, E>(eff: Effect.Effect<A, E, SkillService | LangfuseService>): Promise<Exit.Exit<A, E>> {
  let result!: Exit.Exit<A, E>
  await Instance.provide({
    directory: process.cwd(),
    async fn() {
      result = (await AppRuntime.runPromiseExit(provideSkillsLayer(eff) as Effect.Effect<A, E>)) as Exit.Exit<A, E>
    },
  })
  return result
}

function formatErrorFromCause<E>(cause: Cause.Cause<E>): string {
  let e: unknown = undefined
  for (const reason of cause.reasons) {
    if (reason._tag === "Fail") {
      e = reason.error
      break
    }
    if (reason._tag === "Die") {
      e = reason.defect
      break
    }
  }
  if (e && typeof e === "object" && "data" in e) {
    const data = (e as { data?: { op?: unknown; message?: unknown } }).data
    if (data && typeof data === "object") {
      const { op, message } = data as { op?: unknown; message?: unknown }
      const opStr = typeof op === "string" ? op : "error"
      const msgStr = typeof message === "string" ? message : JSON.stringify(data)
      return `[${opStr}] ${msgStr}`
    }
  }
  if (e instanceof Error) return e.name === e.message ? e.name : e.message
  if (e !== undefined) return String(e)
  return Cause.pretty(cause).split("\n")[0] ?? "unexpected error"
}

function pickSource(args: {
  "content-file"?: unknown
  "content-url"?: unknown
  "langfuse-prompt-key"?: unknown
}): ContentSource | undefined {
  const file = args["content-file"]
  const url = args["content-url"]
  const key = args["langfuse-prompt-key"]
  const provided = [file, url, key].filter((v) => typeof v === "string" && v.length > 0).length
  if (provided > 1) throw new Error("only one of --content-file / --content-url / --langfuse-prompt-key allowed")
  if (typeof file === "string") return { kind: "file", path: file }
  if (typeof url === "string") return { kind: "url", url }
  if (typeof key === "string") return { kind: "langfuse-key", key }
  return undefined
}

export const SkillsCommand = cmd({
  command: "skills <command>",
  describe: "manage skills (add/update/delete/list/enable/disable/show/export-schema)",
  builder: (yargs: Argv) =>
    yargs
      .command(SkillsAddCommand)
      .command(SkillsUpdateCommand)
      .command(SkillsDeleteCommand)
      .command(SkillsListCommand)
      .command(SkillsEnableCommand)
      .command(SkillsDisableCommand)
      .command(SkillsShowCommand)
      .command(SkillsExportSchemaCommand)
      .demandCommand(),
  async handler() {},
})

export const SkillsAddCommand = cmd({
  command: "add",
  describe: "add a skill (from file / url / existing langfuse prompt)",
  builder: (yargs: Argv) =>
    yargs
      .option("name", { type: "string", describe: "skill name (snake_case)", demandOption: true })
      .option("description", { type: "string", describe: "1-line description", demandOption: true })
      .option("content-file", { type: "string", describe: "read body from local file" })
      .option("content-url", { type: "string", describe: "fetch body from https URL" })
      .option("langfuse-prompt-key", { type: "string", describe: "link to existing Langfuse prompt key" })
      .option("label", { type: "string", default: "production", describe: "Langfuse label (default 'production')" })
      .option("scope", { type: "string", choices: [...ScopeChoices], default: "system" })
      .option("enabled", { type: "boolean", default: true })
      .option("dry-run", { type: "boolean", default: false }),
  async handler(args) {
    let source: ContentSource | undefined
    try {
      source = pickSource(args)
    } catch (e) {
      UI.error(e instanceof Error ? e.message : String(e))
      process.exitCode = 2
      return
    }
    if (!source) {
      UI.error("must provide one of --content-file / --content-url / --langfuse-prompt-key")
      process.exitCode = 2
      return
    }
    const exit = await runWithLayers(
      SkillCli.addSkill({
        name: String(args.name),
        description: String(args.description),
        source,
        label: String(args.label),
        scope: String(args.scope) as Scope,
        enabled: Boolean(args.enabled),
        dryRun: Boolean(args["dry-run"]),
      }),
    )
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    writeOut(JSON.stringify(exit.value, null, 2))
  },
})

export const SkillsUpdateCommand = cmd({
  command: "update",
  describe: "update a skill's metadata or content",
  builder: (yargs: Argv) =>
    yargs
      .option("name", { type: "string", demandOption: true })
      .option("description", { type: "string" })
      .option("content-file", { type: "string" })
      .option("content-url", { type: "string" })
      .option("label", { type: "string" })
      .option("scope", { type: "string", choices: [...ScopeChoices] })
      .option("enabled", { type: "boolean" })
      .option("dry-run", { type: "boolean", default: false }),
  async handler(args) {
    let source: ContentSource | undefined
    try {
      source = pickSource(args)
    } catch (e) {
      UI.error(e instanceof Error ? e.message : String(e))
      process.exitCode = 2
      return
    }
    const exit = await runWithLayers(
      SkillCli.updateSkill({
        name: String(args.name),
        description: typeof args.description === "string" ? args.description : undefined,
        source,
        label: typeof args.label === "string" ? args.label : undefined,
        scope: typeof args.scope === "string" ? (args.scope as Scope) : undefined,
        enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
        dryRun: Boolean(args["dry-run"]),
      }),
    )
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    writeOut(JSON.stringify(exit.value, null, 2))
  },
})

export const SkillsDeleteCommand = cmd({
  command: "delete",
  describe: "delete a skill (DB row only; Langfuse prompt is preserved)",
  builder: (yargs: Argv) => yargs.option("name", { type: "string", demandOption: true }),
  async handler(args) {
    const exit = await runWithLayers(SkillCli.deleteSkill(String(args.name)))
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    writeOut(`deleted: ${String(args.name)}`)
  },
})

export const SkillsListCommand = cmd({
  command: "list",
  describe: "list skills",
  builder: (yargs: Argv) =>
    yargs
      .option("scope", { type: "string", choices: [...ScopeChoices] })
      .option("enabled-only", { type: "boolean", default: false })
      .option("output", { type: "string", choices: ["text", "json"] as const, default: "text" }),
  async handler(args) {
    const exit = await runWithLayers(
      SkillCli.listSkills({
        scope: typeof args.scope === "string" ? (args.scope as Scope) : undefined,
        enabledOnly: Boolean(args["enabled-only"]),
      }),
    )
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    const rows = exit.value
    if (String(args.output) === "json") {
      writeOut(JSON.stringify(rows, null, 2))
    } else {
      for (const r of rows) {
        const desc = (r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
        writeOut(`${r.name}\t${r.scope}\t${r.enabled ? "enabled" : "disabled"}\t${desc}`)
      }
    }
  },
})

export const SkillsEnableCommand = cmd({
  command: "enable",
  describe: "enable a skill",
  builder: (yargs: Argv) => yargs.option("name", { type: "string", demandOption: true }),
  async handler(args) {
    const exit = await runWithLayers(SkillCli.setEnabled(String(args.name), true))
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    writeOut(`enabled: ${String(args.name)}`)
  },
})

export const SkillsDisableCommand = cmd({
  command: "disable",
  describe: "disable a skill",
  builder: (yargs: Argv) => yargs.option("name", { type: "string", demandOption: true }),
  async handler(args) {
    const exit = await runWithLayers(SkillCli.setEnabled(String(args.name), false))
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    writeOut(`disabled: ${String(args.name)}`)
  },
})

export const SkillsShowCommand = cmd({
  command: "show <name>",
  describe: "show skill metadata + Langfuse body",
  builder: (yargs: Argv) =>
    yargs
      .positional("name", { type: "string", demandOption: true })
      .option("output", { type: "string", choices: ["text", "json"] as const, default: "text" }),
  async handler(args) {
    const exit = await runWithLayers(SkillCli.showSkill(String(args.name)))
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    if (!exit.value) {
      UI.error(`skill not found: ${String(args.name)}`)
      process.exitCode = 1
      return
    }
    const { row, body } = exit.value
    if (String(args.output) === "json") {
      writeOut(JSON.stringify({ row, body }, null, 2))
      return
    }
    writeOut(`# ${row.name}`)
    writeOut(`scope: ${row.scope}    enabled: ${row.enabled}    label: ${row.langfuse_label}`)
    writeOut(`langfuse: ${row.langfuse_prompt_key}`)
    writeOut(``)
    writeOut(`## description`)
    writeOut(row.description)
    writeOut(``)
    writeOut(`## body (Langfuse)`)
    writeOut(body ?? "(unavailable — Langfuse fetch failed or not configured)")
  },
})

export const SkillsExportSchemaCommand = cmd({
  command: "export-schema",
  describe: "emit Anthropic-compatible tool schema for the skill loader (with available skills inlined in description)",
  builder: (yargs: Argv) => yargs,
  async handler() {
    const eff = Effect.gen(function* () {
      const skill = yield* SkillIndex.Service
      const list = yield* skill.available()
      return list
    })
    let allSkills: { name: string; description: string }[] = []
    await Instance.provide({
      directory: process.cwd(),
      async fn() {
        const exit = await AppRuntime.runPromiseExit(eff)
        if (Exit.isFailure(exit)) {
          UI.error(formatErrorFromCause(exit.cause))
          process.exitCode = 1
          return
        }
        allSkills = exit.value.map((s) => ({ name: s.name, description: s.description }))
      },
    })
    const enumeration =
      allSkills.length > 0
        ? "\n\nAvailable skills:\n" + allSkills.map((s) => `- ${s.name}: ${s.description}`).join("\n")
        : "\n\nNo skills are currently available."
    const schema = {
      name: "skill",
      description:
        "Load a domain-specific skill into the active session. The skill body provides additional instructions, prompt templates, or workflow guidance for the LLM. Pass the `name` of one of the listed skills." +
        enumeration,
      input_schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name (must be one of the available skills)" },
        },
        required: ["name"],
      },
    }
    writeOut(JSON.stringify(schema, null, 2))
  },
})
