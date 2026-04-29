import type { Argv } from "yargs"
import { Effect } from "effect"
import { Instance } from "../../project/instance"
import { ToolRegistry } from "@/tool/registry"
import { AppRuntime } from "@/effect/app-runtime"
import { cmd } from "./cmd"
import { UI } from "../ui"
import * as EffectZod from "@/util/effect-zod"

export const ToolsCommand = cmd({
  command: "tools <command>",
  describe: "inspect built-in tools (list / show / export-schema)",
  builder: (yargs: Argv) =>
    yargs.command(ToolsListCommand).command(ToolsShowCommand).command(ToolsExportSchemaCommand).demandCommand(),
  async handler() {},
})

async function withToolRegistry<A>(fn: (svc: ToolRegistry.Interface) => Effect.Effect<A>): Promise<A> {
  let result!: A
  await Instance.provide({
    directory: process.cwd(),
    async fn() {
      result = await AppRuntime.runPromise(
        Effect.gen(function* () {
          const svc = yield* ToolRegistry.Service
          return yield* fn(svc)
        }),
      )
    },
  })
  return result
}

export const ToolsListCommand = cmd({
  command: "list",
  describe: "list all built-in tool ids (one per line)",
  builder: (yargs: Argv) => yargs.option("verbose", { type: "boolean", describe: "include description" }),
  async handler(args) {
    const verbose = Boolean(args.verbose)
    const all = await withToolRegistry((svc) => svc.all())
    for (const tool of all) {
      if (verbose) UI.println(`${tool.id}\t${(tool.description ?? "").split("\n")[0]?.slice(0, 80) ?? ""}`)
      else UI.println(tool.id)
    }
  },
})

export const ToolsShowCommand = cmd({
  command: "show <id>",
  describe: "show tool description + JSON schema",
  builder: (yargs: Argv) =>
    yargs.positional("id", { type: "string", describe: "tool id (e.g. generate-image)", demandOption: true }),
  async handler(args) {
    const id = String(args.id)
    const all = await withToolRegistry((svc) => svc.all())
    const tool = all.find((t) => t.id === id)
    if (!tool) {
      UI.error(`tool not found: ${id}`)
      process.exitCode = 1
      return
    }
    const schema = EffectZod.toJsonSchema(tool.parameters)
    UI.println(`# ${tool.id}\n`)
    UI.println(tool.description ?? "")
    UI.println(`\n## Parameters\n`)
    UI.println(JSON.stringify(schema, null, 2))
  },
})

export const ToolsExportSchemaCommand = cmd({
  command: "export-schema [id]",
  describe: "emit Anthropic-compatible tool JSON schemas (single id or all)",
  builder: (yargs: Argv) =>
    yargs.positional("id", { type: "string", describe: "optional tool id; omit to export all" }),
  async handler(args) {
    const id = args.id ? String(args.id) : undefined
    const all = await withToolRegistry((svc) => svc.all())
    const filtered = id ? all.filter((t) => t.id === id) : all
    if (id && filtered.length === 0) {
      UI.error(`tool not found: ${id}`)
      process.exitCode = 1
      return
    }
    const out = filtered.map((tool) => ({
      name: tool.id,
      description: tool.description ?? "",
      input_schema: EffectZod.toJsonSchema(tool.parameters),
    }))
    UI.println(JSON.stringify(id ? out[0] : out, null, 2))
  },
})
