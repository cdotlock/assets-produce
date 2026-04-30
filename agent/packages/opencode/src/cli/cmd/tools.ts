import type { Argv } from "yargs"
import { Cause, Effect, Exit } from "effect"
import * as fs from "fs/promises"
import { Instance } from "../../project/instance"
import { ToolRegistry } from "@/tool/registry"
import { AppRuntime } from "@/effect/app-runtime"
import { SessionID, MessageID } from "@/session/schema"
import type * as Tool from "@/tool/tool"
import { cmd } from "./cmd"
import { UI } from "../ui"
import * as EffectZod from "@/util/effect-zod"
import { type OptionDef, toYargsBuilder } from "../option-def"
import { getGlobalContext } from "../global-context"
import { warnDryRunIgnored } from "../output/dry-run-guard"
import { ExitCode } from "../errors/codes"
import { formatError } from "../errors/router"

const MAX_PARAMS_FILE_BYTES = 1_000_000

function writeOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

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

async function withToolRegistry<A>(fn: (svc: ToolRegistry.Interface) => Effect.Effect<A>): Promise<Exit.Exit<A>> {
  let result!: Exit.Exit<A>
  await Instance.provide({
    directory: process.cwd(),
    async fn() {
      result = await AppRuntime.runPromiseExit(
        Effect.gen(function* () {
          const svc = yield* ToolRegistry.Service
          return yield* fn(svc)
        }),
      )
    },
  })
  return result
}

function firstFailure<E>(cause: Cause.Cause<E>): unknown {
  for (const reason of cause.reasons) {
    if (reason._tag === "Fail") return reason.error
    if (reason._tag === "Die") return reason.defect
  }
  return undefined
}

function unwrap<A>(exit: Exit.Exit<A>): A {
  if (Exit.isSuccess(exit)) return exit.value
  const { exitCode, message } = formatError(exit.cause)
  UI.error(message || Cause.pretty(exit.cause).split("\n")[0] || "unexpected error")
  process.exit(exitCode)
}

function exitToolError(exit: Exit.Exit<unknown>): { title: string; output: string; metadata: Record<string, unknown> } {
  let message = "unexpected error"
  if (Exit.isFailure(exit)) {
    const e = firstFailure(exit.cause)
    if (e && typeof e === "object" && "data" in e) {
      const data = (e as { data?: unknown }).data
      if (data && typeof data === "object") {
        const { op, status, message: m } = data as { op?: unknown; status?: unknown; message?: unknown }
        const opStr = typeof op === "string" ? op : "error"
        const msgStr = typeof m === "string" ? m : JSON.stringify(data).slice(0, 256)
        message = typeof status === "number" ? `[${opStr}/${status}] ${msgStr}` : `[${opStr}] ${msgStr}`
      } else {
        message = JSON.stringify(data).slice(0, 256)
      }
    } else if (e instanceof Error) {
      message = e.name === e.message ? e.name : e.message
    } else if (e !== undefined) {
      message = String(e)
    } else {
      message = Cause.pretty(exit.cause).split("\n")[0] ?? "unexpected error"
    }
  }
  return {
    title: "tool failed",
    output: `tool error: ${message}`,
    metadata: { error: true, message },
  }
}

const toolsListOptions: OptionDef[] = [
  {
    flag: "--verbose",
    description: "include description",
    type: "boolean",
  },
]

export const ToolsListCommand = cmd({
  command: "list",
  describe: "list all built-in tool ids (one per line)",
  builder: (yargs: Argv) => toYargsBuilder(yargs, toolsListOptions),
  async handler(args) {
    if (getGlobalContext().dryRun) warnDryRunIgnored("tools list")
    const verbose = Boolean(args.verbose)
    const exit = await withToolRegistry((svc) => svc.all())
    const all = unwrap(exit)
    if (getGlobalContext().output === "json") {
      writeOut(
        JSON.stringify(
          all.map((t) => ({ id: t.id, description: t.description ?? "" })),
          null,
          2,
        ),
      )
      return
    }
    for (const tool of all) {
      if (verbose) {
        const desc = (tool.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
        writeOut(`${tool.id}\t${desc}`)
      } else {
        writeOut(tool.id)
      }
    }
  },
})

export const ToolsShowCommand = cmd({
  command: "show <id>",
  describe: "show tool description + JSON schema",
  builder: (yargs: Argv) =>
    yargs.positional("id", { type: "string", describe: "tool id (e.g. generate-image)", demandOption: true }),
  async handler(args) {
    if (getGlobalContext().dryRun) warnDryRunIgnored("tools show")
    const id = String(args.id)
    const exit = await withToolRegistry((svc) => svc.all())
    const all = unwrap(exit)
    const tool = all.find((t) => t.id === id)
    if (!tool) {
      UI.error(`tool not found: ${id}`)
      process.exit(ExitCode.GENERAL)
    }
    const schema = EffectZod.toJsonSchema(tool.parameters)
    writeOut(`# ${tool.id}\n`)
    writeOut(tool.description ?? "")
    writeOut(`\n## Parameters\n`)
    writeOut(JSON.stringify(schema, null, 2))
  },
})

function makeStubContext(abort: AbortSignal): Tool.Context {
  return {
    sessionID: SessionID.descending(),
    messageID: MessageID.ascending(),
    agent: "cli",
    abort,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

const toolsCallOptions: OptionDef[] = [
  {
    flag: "--json",
    description: "JSON params object as string",
  },
  {
    flag: "--params-file",
    description: "path to JSON file with params",
  },
  {
    flag: "--output",
    description: "raw=tool output text; url=output as a URL line; json=full result {output, metadata}",
    extra: { choices: ["raw", "url", "json"] as const, default: "raw" },
  },
]

export const ToolsCallCommand = cmd({
  command: "call <id>",
  describe: "invoke a single tool directly with JSON params (--json or --params-file)",
  builder: (yargs: Argv) =>
    toYargsBuilder(
      yargs.positional("id", {
        type: "string",
        describe: "tool id (e.g. generate-image-nanobanana)",
        demandOption: true,
      }),
      toolsCallOptions,
    ),
  async handler(args) {
    const id = String(args.id)
    let paramsRaw: string | undefined
    if (args.json) paramsRaw = String(args.json)
    else if (args["params-file"]) {
      const path = String(args["params-file"])
      const stat = await fs.stat(path).catch(() => null)
      if (stat && stat.size > MAX_PARAMS_FILE_BYTES) {
        UI.error(`params file too large: ${stat.size} bytes (max ${MAX_PARAMS_FILE_BYTES})`)
        process.exit(ExitCode.USAGE)
      }
      paramsRaw = await fs.readFile(path, "utf8")
    } else if (process.stdin.isTTY) {
      UI.error("provide --json '<obj>' or --params-file <path>; pipe JSON via stdin only when non-TTY")
      process.exit(ExitCode.USAGE)
    } else {
      paramsRaw = await new Promise<string>((resolve, reject) => {
        let data = ""
        let bytes = 0
        process.stdin.setEncoding("utf8")
        process.stdin.on("data", (chunk) => {
          bytes += Buffer.byteLength(chunk, "utf8")
          if (bytes > MAX_PARAMS_FILE_BYTES) {
            reject(new Error(`stdin payload too large (max ${MAX_PARAMS_FILE_BYTES} bytes)`))
            return
          }
          data += chunk
        })
        process.stdin.on("end", () => resolve(data))
        process.stdin.on("error", reject)
      }).catch((e) => {
        UI.error(e instanceof Error ? e.message : String(e))
        process.exit(ExitCode.USAGE)
      })
    }
    let params: Record<string, unknown>
    try {
      params = JSON.parse(paramsRaw || "{}")
    } catch (e) {
      UI.error(`invalid JSON params: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(ExitCode.USAGE)
    }

    const ctl = new AbortController()
    process.once("SIGINT", () => ctl.abort())
    const exit = await withToolRegistry((svc) =>
      Effect.gen(function* () {
        const all = yield* svc.all()
        const tool = all.find((t) => t.id === id)
        if (!tool) return null
        return yield* tool.execute(params, makeStubContext(ctl.signal))
      }),
    )

    let result: { title: string; output: string; metadata: Record<string, unknown> } | null
    if (Exit.isSuccess(exit)) {
      result = exit.value
    } else {
      result = exitToolError(exit)
    }
    if (result === null) {
      UI.error(`tool not found: ${id}`)
      process.exit(ExitCode.GENERAL)
    }
    const isError = Boolean((result.metadata as Record<string, unknown> | undefined)?.error)
    const mode = String(args.output)
    if (mode === "json") {
      writeOut(JSON.stringify({ output: result.output, metadata: result.metadata, title: result.title }, null, 2))
    } else if (mode === "url") {
      if (isError) {
        UI.error(result.output)
      } else {
        writeOut(result.output.trim())
      }
    } else {
      writeOut(result.output)
    }
    if (isError) process.exit(ExitCode.GENERAL)
  },
})

export const ToolsExportSchemaCommand = cmd({
  command: "export-schema [id]",
  describe: "emit Anthropic-compatible tool JSON schemas (single id or all)",
  builder: (yargs: Argv) =>
    yargs.positional("id", { type: "string", describe: "optional tool id; omit to export all" }),
  async handler(args) {
    if (getGlobalContext().dryRun) warnDryRunIgnored("tools export-schema")
    const id = args.id ? String(args.id) : undefined
    const exit = await withToolRegistry((svc) => svc.all())
    const all = unwrap(exit)
    const filtered = id ? all.filter((t) => t.id === id) : all
    if (id && filtered.length === 0) {
      UI.error(`tool not found: ${id}`)
      process.exit(ExitCode.GENERAL)
    }
    const out = filtered.map((tool) => ({
      name: tool.id,
      description: tool.description ?? "",
      input_schema: EffectZod.toJsonSchema(tool.parameters),
    }))
    writeOut(JSON.stringify(id ? out[0] : out, null, 2))
  },
})
