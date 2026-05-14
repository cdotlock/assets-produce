// Small subprocess helper shared by `cg-render` and `upscale-image`.
//
// Each Phase 9 atomic tool dispatches to a Python script under
// `tools/<name>/`. Conventions enforced here:
//   - stdout is JSON; stderr is logs + error envelope
//   - JSON payload is passed via stdin with `--input -`
//   - Per-tool venv interpreter is preferred (`tools/<name>/.venv/bin/python3`),
//     with `PYTHON` env override and a `python3` PATH fallback.
//
// Kept stateless on purpose — tests can replace the exported `runPython`
// reference by injecting a fake function via the tool factory's `runner`
// parameter (see cg-render.ts / upscale-image.ts). No Effect.Service ceremony.

import { existsSync } from "fs"
import path from "path"
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "tool.python-runner" })

export interface PythonRunInput {
  /** Absolute path to the .py script. */
  script: string
  /** JSON-serializable payload; written to the process stdin if present. */
  input?: unknown
  /** Extra CLI args appended after `--input -`. */
  extraArgs?: readonly string[]
  /** Hard timeout. Defaults to 5 minutes. */
  timeoutMs?: number
  /** Optional AbortSignal — wired up to Bun.spawn's signal. */
  signal?: AbortSignal
}

export interface PythonRunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class PythonRunError extends Error {
  public readonly exitCode: number
  public readonly stderr: string
  constructor(message: string, cause: { exitCode: number; stderr: string }) {
    super(message)
    this.name = "PythonRunError"
    this.exitCode = cause.exitCode
    this.stderr = cause.stderr
  }
}

export type PythonRunner = (opts: PythonRunInput) => Promise<PythonRunResult>

export function resolveInterpreter(scriptPath: string): string {
  const scriptDir = path.dirname(scriptPath)
  const venvPython = path.join(scriptDir, ".venv", "bin", "python3")
  if (existsSync(venvPython)) return venvPython
  return process.env.PYTHON || "python3"
}

export const runPython: PythonRunner = async (opts) => {
  const interpreter = resolveInterpreter(opts.script)
  const args = ["--input", "-", ...(opts.extraArgs ?? [])]
  const timeoutMs = opts.timeoutMs ?? 300_000

  const proc = Bun.spawn([interpreter, opts.script, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    signal: opts.signal,
  })

  // Write JSON payload to stdin then close — Python's `_run_json_main`
  // blocks on `sys.stdin.read()` until EOF.
  if (opts.input !== undefined) {
    const stdin = proc.stdin
    stdin.write(JSON.stringify(opts.input))
    stdin.end()
  } else {
    proc.stdin.end()
  }

  const killTimer = setTimeout(() => {
    log.warn("python subprocess timeout — killing", { script: opts.script, timeoutMs })
    proc.kill()
  }, timeoutMs)

  let exitCode: number
  try {
    exitCode = await proc.exited
  } finally {
    clearTimeout(killTimer)
  }
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { stdout, stderr, exitCode }
}
