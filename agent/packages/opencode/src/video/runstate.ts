import * as fs from "fs/promises"
import * as path from "path"
import type { VideoPayload } from "./payload"

export interface VideoRunState {
  status: string
  promptPath?: string
  runDir?: string
  videoURL?: string
  error?: string
  updatedAt: string
}

export function defaultRunDir(promptPath: string, now = new Date()): string {
  const stamp = [
    now.getFullYear().toString().padStart(4, "0"),
    (now.getMonth() + 1).toString().padStart(2, "0"),
    now.getDate().toString().padStart(2, "0"),
    "-",
    now.getHours().toString().padStart(2, "0"),
    now.getMinutes().toString().padStart(2, "0"),
    now.getSeconds().toString().padStart(2, "0"),
  ].join("")
  return path.join(path.dirname(path.resolve(promptPath)), "runs", stamp)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false
    throw err
  }
}

export async function createRunDir(promptPath: string, requested?: string): Promise<string> {
  let runDir = requested ? path.resolve(requested) : defaultRunDir(promptPath)
  if (!requested) {
    const base = runDir
    for (let suffix = 1; await exists(runDir); suffix++) {
      runDir = `${base}-${suffix.toString().padStart(2, "0")}`
    }
  } else if (await exists(runDir)) {
    const entries = await fs.readdir(runDir)
    if (entries.length > 0) throw new Error(`run directory already exists and is not empty: ${runDir}`)
  }
  await fs.mkdir(runDir, { recursive: true })
  return runDir
}

export async function writeJSON(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function writeDryRun(runDir: string, promptPath: string, request: VideoPayload): Promise<VideoRunState> {
  await writeJSON(path.join(runDir, "request.json"), request)
  const state: VideoRunState = {
    status: "dry_run",
    promptPath: path.resolve(promptPath),
    runDir,
    updatedAt: new Date().toISOString(),
  }
  await writeJSON(path.join(runDir, "state.json"), state)
  return state
}

export async function readState(runDir: string): Promise<VideoRunState> {
  const raw = await fs.readFile(path.join(runDir, "state.json"), "utf8")
  return JSON.parse(raw) as VideoRunState
}
