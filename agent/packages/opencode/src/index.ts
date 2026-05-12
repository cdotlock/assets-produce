import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { RunCommand } from "./cli/cmd/run"
import { GenerateCommand } from "./cli/cmd/generate"
import * as Log from "@opencode-ai/core/util/log"
import { ConsoleCommand } from "./cli/cmd/account"
import { ProvidersCommand } from "./cli/cmd/providers"
import { AgentCommand } from "./cli/cmd/agent"
import { UpgradeCommand } from "./cli/cmd/upgrade"
import { UninstallCommand } from "./cli/cmd/uninstall"
import { ModelsCommand } from "./cli/cmd/models"
import { UI } from "./cli/ui"
import { Installation } from "./installation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { NamedError } from "@opencode-ai/core/util/error"
import { FormatError } from "./cli/error"
import { ServeCommand } from "./cli/cmd/serve"
import { Filesystem } from "@/util/filesystem"
import { DebugCommand } from "./cli/cmd/debug"
import { StatsCommand } from "./cli/cmd/stats"
import { McpCommand } from "./cli/cmd/mcp"
import { GithubCommand } from "./cli/cmd/github"
import { ExportCommand } from "./cli/cmd/export"
import { ImportCommand } from "./cli/cmd/import"
import { EOL } from "os"
import { WebCommand } from "./cli/cmd/web"
import { PrCommand } from "./cli/cmd/pr"
import { SessionCommand } from "./cli/cmd/session"
import { DbCommand } from "./cli/cmd/db"
import { OssCommand } from "./cli/cmd/oss"
import { ToolsCommand } from "./cli/cmd/tools"
import { SkillsCommand } from "./cli/cmd/skills"
import { UsersCommand } from "./cli/cmd/users"
import { ConfigCommand } from "./cli/cmd/config"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { JsonMigration } from "@/storage/json-migration"
import { Database } from "@/storage/db"
import { errorMessage } from "./util/error"
import { PluginCommand } from "./cli/cmd/plug"
import { Heap } from "./cli/heap"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { ensureProcessMetadata } from "@opencode-ai/core/util/opencode-process"
import { GLOBAL_OPTIONS, toYargsBuilder } from "./cli/option-def"
import { isNoColor, isNonInteractive, outputMode } from "./cli/output/mode"
import { setGlobalContext } from "./cli/global-context"
import { ExitCode } from "./cli/errors/codes"
import { router } from "./cli/errors/router"

const processMetadata = ensureProcessMetadata("main")

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: errorMessage(e),
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: errorMessage(e),
  })
})

const args = hideBin(process.argv)

function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("opencode ")) {
    process.stderr.write(UI.logo() + EOL + EOL)
    process.stderr.write(text)
    return
  }
  process.stderr.write(out)
}

// Phase 6 Task 4.3 — attach GLOBAL_OPTIONS to root yargs. yargs already
// registers `--help` / `--version` via .help() / .version() below, so filter
// those two out of the toYargsBuilder call. The full GLOBAL_OPTIONS list is
// kept canonical for `config export-schema` / SKILL.md docs.
const ROOT_GLOBAL_OPTIONS = GLOBAL_OPTIONS.filter((o) => {
  const name = o.flag.split(/\s+/)[0]
  return name !== "--help" && name !== "--version"
})

const cli = toYargsBuilder(
  yargs(args)
    .parserConfiguration({ "populate--": true })
    .scriptName("opencode")
    .wrap(100)
    .help("help", "show help")
    .alias("help", "h")
    .version("version", "show version number", InstallationVersion)
    .alias("version", "v"),
  ROOT_GLOBAL_OPTIONS,
)
  .option("print-logs", {
    describe: "print logs to stderr",
    type: "boolean",
  })
  .option("log-level", {
    describe: "log level",
    type: "string",
    choices: ["DEBUG", "INFO", "WARN", "ERROR"],
  })
  .option("pure", {
    describe: "run without external plugins",
    type: "boolean",
  })
  .middleware((opts: Record<string, unknown>) => {
    // Phase 6 Task 4.3 — resolve global flags into a singleton context that
    // leaf handlers read via getGlobalContext(). Runs before the deeper
    // bootstrap middleware below so context is in place by the time any
    // handler executes.
    const ctx = {
      output: outputMode({ output: typeof opts.output === "string" ? opts.output : undefined }),
      dryRun: Boolean(opts["dry-run"]),
      nonInteractive: isNonInteractive({ nonInteractive: Boolean(opts["non-interactive"]) }),
      noColor: isNoColor({ noColor: Boolean(opts["no-color"]) }),
      quiet: Boolean(opts.quiet),
      verbose: Boolean(opts.verbose),
    }
    setGlobalContext(ctx)
    // Propagate auto-resolved non-interactive (e.g. CI=true) onto the parsed
    // args so any code path that consults `args["non-interactive"]` directly
    // sees the inferred value.
    if (ctx.nonInteractive && opts["non-interactive"] !== true) {
      opts["non-interactive"] = true
    }
  })
  .middleware(async (opts) => {
    if (opts.pure) {
      process.env.OPENCODE_PURE = "1"
    }

    await Log.init({
      print: process.argv.includes("--print-logs"),
      dev: Installation.isLocal(),
      level: (() => {
        if (opts.logLevel) return opts.logLevel as Log.Level
        if (Installation.isLocal()) return "DEBUG"
        return "INFO"
      })(),
    })

    Heap.start()

    process.env.AGENT = "1"
    process.env.OPENCODE = "1"
    process.env.OPENCODE_PID = String(process.pid)

    Log.Default.info("opencode", {
      version: InstallationVersion,
      args: process.argv.slice(2),
      process_role: processMetadata.processRole,
      run_id: processMetadata.runID,
    })

    // Phase 6 cleanup: this marker is hardcoded to the upstream "opencode.db"
    // filename even though we renamed the actual DB to agent.db in storage/db.ts.
    // For new installs the file never exists, so JsonMigration.run fires every
    // boot (idempotent but ~1-2s overhead). Rename to "agent.db" once the broader
    // OPENCODE_* -> AGENT_* env / path rename pass lands.
    const marker = path.join(Global.Path.data, "opencode.db")
    if (!(await Filesystem.exists(marker))) {
      const tty = process.stderr.isTTY
      process.stderr.write("Performing one time database migration, may take a few minutes..." + EOL)
      const width = 36
      const orange = "\x1b[38;5;214m"
      const muted = "\x1b[0;2m"
      const reset = "\x1b[0m"
      let last = -1
      if (tty) process.stderr.write("\x1b[?25l")
      try {
        await JsonMigration.run(drizzle({ client: Database.Client().$client }), {
          progress: (event) => {
            const percent = Math.floor((event.current / event.total) * 100)
            if (percent === last && event.current !== event.total) return
            last = percent
            if (tty) {
              const fill = Math.round((percent / 100) * width)
              const bar = `${"■".repeat(fill)}${"･".repeat(width - fill)}`
              process.stderr.write(
                `\r${orange}${bar} ${percent.toString().padStart(3)}%${reset} ${muted}${event.label.padEnd(12)} ${event.current}/${event.total}${reset}`,
              )
              if (event.current === event.total) process.stderr.write("\n")
            } else {
              process.stderr.write(`sqlite-migration:${percent}${EOL}`)
            }
          },
        })
      } finally {
        if (tty) process.stderr.write("\x1b[?25h")
        else {
          process.stderr.write(`sqlite-migration:done${EOL}`)
        }
      }
      process.stderr.write("Database migration complete." + EOL)
    }
  })
  .usage("")
  .completion("completion", "generate shell completion script")
  .command(McpCommand)
  .command(RunCommand)
  .command(GenerateCommand)
  .command(DebugCommand)
  .command(ConsoleCommand)
  .command(ProvidersCommand)
  .command(AgentCommand)
  .command(UpgradeCommand)
  .command(UninstallCommand)
  .command(ServeCommand)
  .command(WebCommand)
  .command(ModelsCommand)
  .command(StatsCommand)
  .command(ExportCommand)
  .command(ImportCommand)
  .command(GithubCommand)
  .command(PrCommand)
  .command(SessionCommand)
  .command(PluginCommand)
  .command(DbCommand)
  .command(OssCommand)
  .command(ToolsCommand)
  .command(SkillsCommand)
  .command(UsersCommand)
  .command(ConfigCommand)
  .fail((msg, err) => {
    // Phase 6 Task 5 — yargs-detected usage failures (missing required arg,
    // unknown flag, invalid value) map to ExitCode.USAGE (2). Anything else
    // bubbles to the top-level catch and gets routed by `cli/errors/router`.
    if (
      msg?.startsWith("Unknown argument") ||
      msg?.startsWith("Not enough non-option arguments") ||
      msg?.startsWith("Invalid values:") ||
      msg?.startsWith("Missing required argument")
    ) {
      if (msg) process.stderr.write(`${msg}${EOL}`)
      cli.showHelp(show)
      process.exit(ExitCode.USAGE)
    }
    if (err) throw err
    process.exit(ExitCode.GENERAL)
  })
  .strict()

try {
  if (args.includes("-h") || args.includes("--help")) {
    await cli.parse(args, (err: Error | undefined, _argv: unknown, out: string) => {
      if (err) throw err
      if (!out) return
      show(out)
    })
  } else {
    await cli.parse()
  }
} catch (e) {
  let data: Record<string, any> = {}
  if (e instanceof NamedError) {
    const obj = e.toObject()
    Object.assign(data, {
      ...obj.data,
    })
  }

  if (e instanceof Error) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      cause: e.cause?.toString(),
      stack: e.stack,
    })
  }

  if (e instanceof ResolveMessage) {
    Object.assign(data, {
      name: e.name,
      message: e.message,
      code: e.code,
      specifier: e.specifier,
      referrer: e.referrer,
      position: e.position,
      importKind: e.importKind,
    })
  }
  Log.Default.error("fatal", data)
  const formatted = FormatError(e)
  if (formatted) UI.error(formatted)
  if (formatted === undefined) {
    UI.error("Unexpected error, check log file at " + Log.file() + " for more details" + EOL)
    process.stderr.write(errorMessage(e) + EOL)
  }
  // Phase 6 Task 5 — route the caught error through the central router so
  // exit codes line up with ERRORS.md. The `process.exit()` in the finally
  // block consumes process.exitCode.
  process.exitCode = router(e)
} finally {
  // Some subprocesses don't react properly to SIGTERM and similar signals.
  // Most notably, some docker-container-based MCP servers don't handle such signals unless
  // run using `docker run --init`.
  // Explicitly exit to avoid any hanging subprocesses.
  process.exit()
}
