import type { Argv } from "yargs"
import * as path from "path"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { type OptionDef, toYargsBuilder } from "../option-def"
import { getGlobalContext } from "../global-context"
import { ExitCode } from "../errors/codes"
import { buildPayload } from "@/video/payload"
import { createRunDir, readState, writeDryRun } from "@/video/runstate"
import { validatePrompt } from "@/video/validate"
import { comparePromptFiles, reviewPromptFile } from "@/video/review"

function writeOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

function emitJSON(value: unknown): void {
  writeOut(JSON.stringify(value, null, 2))
}

function projectRoot(value: unknown): string {
  return path.resolve(value ? String(value) : process.cwd())
}

function shouldJSON(args: Record<string, unknown>): boolean {
  return getGlobalContext().output === "json" || Boolean(args.json)
}

function exitError(message: string, code: ExitCode = ExitCode.GENERAL): never {
  UI.error(message)
  process.exit(code)
}

export const VideoCommand = cmd({
  command: "video <command>",
  describe: "prompt-only video workflow utilities (payload / validate / submit dry-run / status / prompt)",
  builder: (yargs: Argv) =>
    yargs
      .command(VideoPayloadCommand)
      .command(VideoValidateCommand)
      .command(VideoSubmitCommand)
      .command(VideoStatusCommand)
      .command(VideoPromptCommand)
      .demandCommand(),
  async handler() {},
})

const promptPathOptions: OptionDef[] = [
  { flag: "--project-root", description: "project root used to resolve relative asset paths" },
  { flag: "--allow-non-oss", description: "allow generic http(s) media URLs instead of OSS-only URLs", type: "boolean" },
  { flag: "--allow-text-only", description: "allow payloads without sourceImageUrl", type: "boolean" },
]

export const VideoPayloadCommand = cmd({
  command: "payload <prompt>",
  describe: "build video gateway JSON from prompt.md without calling any media generator",
  builder: (yargs: Argv) =>
    toYargsBuilder(
      yargs.positional("prompt", { type: "string", describe: "prompt.md path", demandOption: true }),
      promptPathOptions,
    ),
  async handler(args) {
    try {
      const payload = await buildPayload(String(args.prompt), {
        projectRoot: projectRoot(args["project-root"]),
        allowNonOSS: Boolean(args["allow-non-oss"]),
        allowTextOnly: Boolean(args["allow-text-only"]),
      })
      emitJSON(payload)
    } catch (err) {
      exitError(err instanceof Error ? err.message : String(err))
    }
  },
})

const validateOptions: OptionDef[] = [
  { flag: "--project-root", description: "project root used to resolve relative asset paths" },
  { flag: "--timeout", description: "URL check timeout in seconds", type: "number" },
  { flag: "--allow-non-oss", description: "allow generic http(s) media URLs instead of OSS-only URLs", type: "boolean" },
  { flag: "--allow-empty", description: "allow prompt files without media references", type: "boolean" },
  { flag: "--json", description: "print JSON output", type: "boolean" },
]

export const VideoValidateCommand = cmd({
  command: "validate <prompt>",
  describe: "validate prompt media URLs; does not call image/video generation",
  builder: (yargs: Argv) =>
    toYargsBuilder(
      yargs.positional("prompt", { type: "string", describe: "prompt.md path", demandOption: true }),
      validateOptions,
    ),
  async handler(args) {
    try {
      const timeout = Number(args.timeout ?? 300)
      const result = await validatePrompt(String(args.prompt), {
        projectRoot: projectRoot(args["project-root"]),
        timeoutMs: timeout * 1000,
        allowNonOSS: Boolean(args["allow-non-oss"]),
        allowEmpty: Boolean(args["allow-empty"]),
      })
      if (shouldJSON(args)) {
        emitJSON(result)
      } else {
        for (const item of result.results) {
          const status = item.ok ? "OK" : "FAIL"
          const source = item.source ? ` <= ${item.source}` : ""
          writeOut(`${status} [${item.expected}] ${item.url}${source}`)
          if (item.ok) writeOut(`  Content-Type: ${item.contentType} | Size: ${item.size ?? "unknown"}`)
          else writeOut(`  Error: ${item.error ?? "unknown"}`)
        }
      }
      if (!result.ok) process.exit(ExitCode.GENERAL)
    } catch (err) {
      exitError(err instanceof Error ? err.message : String(err))
    }
  },
})

const submitOptions: OptionDef[] = [
  { flag: "--project-root", description: "project root used to resolve relative asset paths" },
  { flag: "--run-dir", description: "explicit run directory for dry-run artifacts" },
  { flag: "--dry-run", description: "write request/state locally and do not call the video gateway", type: "boolean" },
  { flag: "--allow-non-oss", description: "allow generic http(s) media URLs instead of OSS-only URLs", type: "boolean" },
  { flag: "--allow-text-only", description: "allow payloads without sourceImageUrl", type: "boolean" },
  { flag: "--json", description: "print JSON output", type: "boolean" },
]

export const VideoSubmitCommand = cmd({
  command: "submit <prompt>",
  describe: "dry-run video submit request; live media generation is intentionally disabled in Phase 7",
  builder: (yargs: Argv) =>
    toYargsBuilder(
      yargs.positional("prompt", { type: "string", describe: "prompt.md path", demandOption: true }),
      submitOptions,
    ),
  async handler(args) {
    const dryRun = getGlobalContext().dryRun || Boolean(args["dry-run"])
    if (!dryRun) {
      exitError("live video submit is disabled in this prompt-only CLI path; rerun with --dry-run", ExitCode.USAGE)
    }

    try {
      const payload = await buildPayload(String(args.prompt), {
        projectRoot: projectRoot(args["project-root"]),
        allowNonOSS: Boolean(args["allow-non-oss"]),
        allowTextOnly: Boolean(args["allow-text-only"]),
      })
      const runDir = await createRunDir(String(args.prompt), args["run-dir"] ? String(args["run-dir"]) : undefined)
      const state = await writeDryRun(runDir, String(args.prompt), payload)
      if (shouldJSON(args)) emitJSON({ status: "dry_run", runDir, request: payload, state })
      else writeOut(`OK dry-run request -> ${path.join(runDir, "request.json")}`)
    } catch (err) {
      exitError(err instanceof Error ? err.message : String(err))
    }
  },
})

const statusOptions: OptionDef[] = [
  { flag: "--json", description: "print JSON output", type: "boolean" },
]

export const VideoStatusCommand = cmd({
  command: "status <runDir>",
  describe: "read a local video dry-run run directory state",
  builder: (yargs: Argv) =>
    toYargsBuilder(
      yargs.positional("runDir", { type: "string", describe: "run directory", demandOption: true }),
      statusOptions,
    ),
  async handler(args) {
    try {
      const state = await readState(String(args.runDir))
      if (shouldJSON(args)) emitJSON(state)
      else {
        writeOut(`status: ${state.status}`)
        if (state.videoURL) writeOut(`video_url: ${state.videoURL}`)
        if (state.error) writeOut(`error: ${state.error}`)
        writeOut(`run_dir: ${state.runDir ?? String(args.runDir)}`)
      }
    } catch (err) {
      exitError(err instanceof Error ? err.message : String(err))
    }
  },
})

export const VideoPromptCommand = cmd({
  command: "prompt <command>",
  describe: "review and compare generated video prompt text",
  builder: (yargs: Argv) =>
    yargs.command(VideoPromptReviewCommand).command(VideoPromptCompareCommand).demandCommand(),
  async handler() {},
})

const reviewOptions: OptionDef[] = [
  { flag: "--json", description: "print JSON output", type: "boolean" },
]

export const VideoPromptReviewCommand = cmd({
  command: "review <prompt>",
  describe: "score one generated prompt against the Phase 7 prompt checklist",
  builder: (yargs: Argv) =>
    toYargsBuilder(
      yargs.positional("prompt", { type: "string", describe: "prompt.md path", demandOption: true }),
      reviewOptions,
    ),
  async handler(args) {
    try {
      const report = await reviewPromptFile(String(args.prompt))
      if (shouldJSON(args)) emitJSON(report)
      else {
        writeOut(`score: ${report.score} (${report.passed}/${report.total})`)
        for (const check of report.checks) writeOut(`${check.ok ? "OK" : "FAIL"} ${check.id} ${check.title}: ${check.detail}`)
      }
      if (!report.ok) process.exit(ExitCode.GENERAL)
    } catch (err) {
      exitError(err instanceof Error ? err.message : String(err))
    }
  },
})

const compareOptions: OptionDef[] = [
  { flag: "--json", description: "print JSON output", type: "boolean" },
]

export const VideoPromptCompareCommand = cmd({
  command: "compare <candidate> <reference>",
  describe: "compare generated prompt text with a reference prompt",
  builder: (yargs: Argv) =>
    toYargsBuilder(
      yargs
        .positional("candidate", { type: "string", describe: "candidate prompt.md", demandOption: true })
        .positional("reference", { type: "string", describe: "reference prompt.md", demandOption: true }),
      compareOptions,
    ),
  async handler(args) {
    try {
      const report = await comparePromptFiles(String(args.candidate), String(args.reference))
      if (shouldJSON(args)) emitJSON(report)
      else {
        writeOut(`compare_score: ${report.score}`)
        writeOut(`candidate_score: ${report.candidate.score}`)
        writeOut(`reference_score: ${report.reference.score}`)
        writeOut(`delta_score: ${report.deltas.score}`)
        writeOut(`delta_body_length: ${report.deltas.bodyLength}`)
      }
    } catch (err) {
      exitError(err instanceof Error ? err.message : String(err))
    }
  },
})
