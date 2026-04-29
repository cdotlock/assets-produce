import type { Argv } from "yargs"
import { Effect } from "effect"
import * as fs from "fs/promises"
import { Instance } from "../../project/instance"
import { ToolRegistry } from "@/tool/registry"
import { AppRuntime } from "@/effect/app-runtime"
import { SessionID, MessageID } from "@/session/schema"
import type * as Tool from "@/tool/tool"
import { cmd } from "./cmd"
import { UI } from "../ui"
import * as EffectZod from "@/util/effect-zod"

export const ToolsCommand = cmd({
  command: "tools <command>",
  describe: "inspect / call built-in tools (list / show / export-schema / call)",
  builder: (yargs: Argv) =>
    yargs
      .command(ToolsListCommand)
      .command(ToolsShowCommand)
      .command(ToolsExportSchemaCommand)
      .command(ToolsCallCommand)
      .demandCommand(),
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

function makeStubContext(): Tool.Context {
  const ts = Date.now().toString(36)
  return {
    sessionID: SessionID.make(`ses_cli_${ts}`),
    messageID: MessageID.make(`msg_cli_${ts}`),
    agent: "cli",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

export const ToolsCallCommand = cmd({
  command: "call <id>",
  describe: "invoke a single tool directly with JSON params (--json or --params-file)",
  builder: (yargs: Argv) =>
    yargs
      .positional("id", { type: "string", describe: "tool id (e.g. generate-image-nanobanana)", demandOption: true })
      .option("json", { type: "string", describe: "JSON params object as string" })
      .option("params-file", { type: "string", describe: "path to JSON file with params" })
      .option("output", {
        type: "string",
        choices: ["raw", "url", "json"] as const,
        default: "raw",
        describe: "raw=tool output text; url=output as a URL line; json=full result {output, metadata}",
      }),
  async handler(args) {
    const id = String(args.id)
    let paramsRaw: string | undefined
    if (args.json) paramsRaw = String(args.json)
    else if (args["params-file"]) paramsRaw = await fs.readFile(String(args["params-file"]), "utf8")
    else {
      paramsRaw = await new Promise<string>((resolve, reject) => {
        let data = ""
        process.stdin.setEncoding("utf8")
        process.stdin.on("data", (chunk) => (data += chunk))
        process.stdin.on("end", () => resolve(data))
        process.stdin.on("error", reject)
      })
    }
    let params: Record<string, unknown>
    try {
      params = JSON.parse(paramsRaw || "{}")
    } catch (e) {
      UI.error(`invalid JSON params: ${e instanceof Error ? e.message : String(e)}`)
      process.exitCode = 2
      return
    }

    const result = await withToolRegistry((svc) =>
      Effect.gen(function* () {
        const all = yield* svc.all()
        const tool = all.find((t) => t.id === id)
        if (!tool) return null
        return yield* tool.execute(params, makeStubContext())
      }),
    )
    if (result === null) {
      UI.error(`tool not found: ${id}`)
      process.exitCode = 1
      return
    }
    const mode = String(args.output)
    if (mode === "json") {
      UI.println(JSON.stringify({ output: result.output, metadata: result.metadata, title: result.title }, null, 2))
    } else if (mode === "url") {
      UI.println(result.output.trim())
    } else {
      UI.println(result.output)
    }
    if (result.metadata && (result.metadata as Record<string, unknown>).error) process.exitCode = 1
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
