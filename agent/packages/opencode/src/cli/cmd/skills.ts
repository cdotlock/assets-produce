import type { Argv } from "yargs"
import { Effect, Exit } from "effect"
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
import { type OptionDef, toYargsBuilder } from "../option-def"
import { getGlobalContext } from "../global-context"
import { applyGlobalDryRun, warnDryRunIgnored } from "../output/dry-run-guard"
import { ExitCode } from "../errors/codes"
import { formatError } from "../errors/router"

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

const skillsAddOptions: OptionDef[] = [
  {
    flag: "--name",
    description: "skill name (snake_case)",
    required: true,
  },
  {
    flag: "--description",
    description: "1-line description",
    required: true,
  },
  {
    flag: "--content-file",
    description: "read body from local file",
  },
  {
    flag: "--content-url",
    description: "fetch body from https URL",
  },
  {
    flag: "--langfuse-prompt-key",
    description: "link to existing Langfuse prompt key",
  },
  {
    flag: "--label",
    description: "Langfuse label (default 'production')",
    extra: { default: "production" },
  },
  {
    flag: "--scope",
    description: "skill visibility: 'system' (CLI only) or 'creator' (WebUI)",
    extra: { choices: [...ScopeChoices], default: "system" },
  },
  {
    flag: "--enabled",
    description: "whether the skill is enabled at creation time",
    type: "boolean",
    extra: { default: true },
  },
  {
    flag: "--dry-run",
    description: "plan the skill add; do not write to DB or Langfuse",
    type: "boolean",
    extra: { default: false },
  },
]

interface SkillsAddArgs {
  name: string
  description: string
  "content-file"?: string
  "content-url"?: string
  "langfuse-prompt-key"?: string
  label: string
  scope: string
  enabled: boolean
  "dry-run": boolean
}

export const SkillsAddCommand = cmd({
  command: "add",
  describe: "add a skill (from file / url / existing langfuse prompt)",
  builder: (yargs: Argv) => toYargsBuilder<unknown, SkillsAddArgs>(yargs, skillsAddOptions),
  async handler(args) {
    let source: ContentSource | undefined
    try {
      source = pickSource(args)
    } catch (e) {
      UI.error(e instanceof Error ? e.message : String(e))
      process.exit(ExitCode.USAGE)
    }
    if (!source) {
      UI.error("must provide one of --content-file / --content-url / --langfuse-prompt-key")
      process.exit(ExitCode.USAGE)
    }
    const exit = await runWithLayers(
      SkillCli.addSkill({
        name: String(args.name),
        description: String(args.description),
        source,
        label: String(args.label),
        scope: String(args.scope) as Scope,
        enabled: Boolean(args.enabled),
        dryRun: applyGlobalDryRun(Boolean(args["dry-run"])),
      }),
    )
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = formatError(exit.cause)
      UI.error(message)
      process.exit(exitCode)
    }
    writeOut(JSON.stringify(exit.value, null, 2))
  },
})

const skillsUpdateOptions: OptionDef[] = [
  {
    flag: "--name",
    description: "skill name to update (snake_case)",
    required: true,
  },
  {
    flag: "--description",
    description: "new 1-line description",
  },
  {
    flag: "--content-file",
    description: "replace body with contents of local file",
  },
  {
    flag: "--content-url",
    description: "replace body by fetching from https URL",
  },
  {
    flag: "--label",
    description: "new Langfuse label",
  },
  {
    flag: "--scope",
    description: "new scope: 'system' or 'creator'",
    extra: { choices: [...ScopeChoices] },
  },
  {
    flag: "--enabled",
    description: "set enabled state",
    type: "boolean",
  },
  {
    flag: "--dry-run",
    description: "plan the update; do not write to DB or Langfuse",
    type: "boolean",
    extra: { default: false },
  },
]

interface SkillsUpdateArgs {
  name: string
  description?: string
  "content-file"?: string
  "content-url"?: string
  label?: string
  scope?: string
  enabled?: boolean
  "dry-run": boolean
}

export const SkillsUpdateCommand = cmd({
  command: "update",
  describe: "update a skill's metadata or content",
  builder: (yargs: Argv) => toYargsBuilder<unknown, SkillsUpdateArgs>(yargs, skillsUpdateOptions),
  async handler(args) {
    let source: ContentSource | undefined
    try {
      source = pickSource(args)
    } catch (e) {
      UI.error(e instanceof Error ? e.message : String(e))
      process.exit(ExitCode.USAGE)
    }
    const exit = await runWithLayers(
      SkillCli.updateSkill({
        name: String(args.name),
        description: typeof args.description === "string" ? args.description : undefined,
        source,
        label: typeof args.label === "string" ? args.label : undefined,
        scope: typeof args.scope === "string" ? (args.scope as Scope) : undefined,
        enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
        dryRun: applyGlobalDryRun(Boolean(args["dry-run"])),
      }),
    )
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = formatError(exit.cause)
      UI.error(message)
      process.exit(exitCode)
    }
    writeOut(JSON.stringify(exit.value, null, 2))
  },
})

const skillsDeleteOptions: OptionDef[] = [
  {
    flag: "--name",
    description: "skill name to delete (snake_case)",
    required: true,
  },
]

export const SkillsDeleteCommand = cmd({
  command: "delete",
  describe: "delete a skill (DB row only; Langfuse prompt is preserved)",
  builder: (yargs: Argv) => toYargsBuilder(yargs, skillsDeleteOptions),
  async handler(args) {
    const name = String(args.name)
    if (applyGlobalDryRun()) {
      writeOut(JSON.stringify({ dryRun: true, action: "delete", name }, null, 2))
      return
    }
    const exit = await runWithLayers(SkillCli.deleteSkill(name))
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = formatError(exit.cause)
      UI.error(message)
      process.exit(exitCode)
    }
    writeOut(`deleted: ${name}`)
  },
})

const skillsListOptions: OptionDef[] = [
  {
    flag: "--scope",
    description: "filter by scope: 'system' or 'creator'",
    extra: { choices: [...ScopeChoices] },
  },
  {
    flag: "--enabled-only",
    description: "only list enabled skills",
    type: "boolean",
    extra: { default: false },
  },
  {
    flag: "--output",
    description: "output format: 'text' (table) or 'json'",
    extra: { choices: ["text", "json"] as const, default: "text" },
  },
]

export const SkillsListCommand = cmd({
  command: "list",
  describe: "list skills",
  builder: (yargs: Argv) => toYargsBuilder(yargs, skillsListOptions),
  async handler(args) {
    if (getGlobalContext().dryRun) warnDryRunIgnored("skills list")
    const exit = await runWithLayers(
      SkillCli.listSkills({
        scope: typeof args.scope === "string" ? (args.scope as Scope) : undefined,
        enabledOnly: Boolean(args["enabled-only"]),
      }),
    )
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = formatError(exit.cause)
      UI.error(message)
      process.exit(exitCode)
    }
    const rows = exit.value
    // Local --output flag wins; otherwise honor global (set by middleware in
    // index.ts: piped stdout / CI=true → "json").
    const local = typeof args.output === "string" ? args.output : undefined
    const wantJson = local === "json" || (local === undefined && getGlobalContext().output === "json")
    if (wantJson) {
      writeOut(JSON.stringify(rows, null, 2))
    } else {
      for (const r of rows) {
        const desc = (r.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
        writeOut(`${r.name}\t${r.scope}\t${r.enabled ? "enabled" : "disabled"}\t${desc}`)
      }
    }
  },
})

const skillsEnableOptions: OptionDef[] = [
  {
    flag: "--name",
    description: "skill name to enable (snake_case)",
    required: true,
  },
]

export const SkillsEnableCommand = cmd({
  command: "enable",
  describe: "enable a skill",
  builder: (yargs: Argv) => toYargsBuilder(yargs, skillsEnableOptions),
  async handler(args) {
    const name = String(args.name)
    if (applyGlobalDryRun()) {
      writeOut(JSON.stringify({ dryRun: true, action: "enable", name }, null, 2))
      return
    }
    const exit = await runWithLayers(SkillCli.setEnabled(name, true))
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = formatError(exit.cause)
      UI.error(message)
      process.exit(exitCode)
    }
    writeOut(`enabled: ${name}`)
  },
})

const skillsDisableOptions: OptionDef[] = [
  {
    flag: "--name",
    description: "skill name to disable (snake_case)",
    required: true,
  },
]

export const SkillsDisableCommand = cmd({
  command: "disable",
  describe: "disable a skill",
  builder: (yargs: Argv) => toYargsBuilder(yargs, skillsDisableOptions),
  async handler(args) {
    const name = String(args.name)
    if (applyGlobalDryRun()) {
      writeOut(JSON.stringify({ dryRun: true, action: "disable", name }, null, 2))
      return
    }
    const exit = await runWithLayers(SkillCli.setEnabled(name, false))
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = formatError(exit.cause)
      UI.error(message)
      process.exit(exitCode)
    }
    writeOut(`disabled: ${name}`)
  },
})

const skillsShowOptions: OptionDef[] = [
  {
    flag: "--output",
    description: "output format: 'text' (markdown) or 'json'",
    extra: { choices: ["text", "json"] as const, default: "text" },
  },
]

export const SkillsShowCommand = cmd({
  command: "show <name>",
  describe: "show skill metadata + Langfuse body",
  builder: (yargs: Argv) =>
    toYargsBuilder(yargs.positional("name", { type: "string", demandOption: true }), skillsShowOptions),
  async handler(args) {
    if (getGlobalContext().dryRun) warnDryRunIgnored("skills show")
    const exit = await runWithLayers(SkillCli.showSkill(String(args.name)))
    if (Exit.isFailure(exit)) {
      const { exitCode, message } = formatError(exit.cause)
      UI.error(message)
      process.exit(exitCode)
    }
    if (!exit.value) {
      UI.error(`skill not found: ${String(args.name)}`)
      process.exit(ExitCode.GENERAL)
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
    if (getGlobalContext().dryRun) warnDryRunIgnored("skills export-schema")
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
          const { exitCode, message } = formatError(exit.cause)
          UI.error(message)
          process.exit(exitCode)
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
