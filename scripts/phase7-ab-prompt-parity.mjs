#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const videoctl = path.join(root, "videoctl", "bin", "videoctl")

function run(label, command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd ?? root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  })
  if (result.status !== 0) {
    throw new Error(`${label} failed with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  return result
}

function parseJSON(label, text) {
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`${label} did not produce JSON: ${err.message}\n${text}`)
  }
}

function result(name, detail) {
  console.log(`PASS ${name}: ${detail}`)
}

function writePrompt(filePath, imagePath) {
  writeFileSync(
    filePath,
    [
      "---",
      "shot_id: phase7_smoke",
      "duration: 12s",
      "ratio: 9:16",
      "assets:",
      "  images:",
      `    - ${imagePath}`,
      "  videos: []",
      "---",
      "韩漫画风，2D 动漫风格画风，9:16 竖屏尺寸。",
      "0-2s @图1 角色站定；2-8s 缓慢转身；最后 2s 镜头静止。",
      "禁止：任何字幕、画面内文字、subtitle、caption、logo、watermark。",
      "",
    ].join("\n"),
  )
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

run("videoctl build", "make", ["-C", "videoctl", "build"])

const tmp = mkdtempSync(path.join(tmpdir(), "phase7-videoctl-smoke-"))
try {
  const assetDir = path.join(tmp, "assets")
  mkdirSync(assetDir, { recursive: true })
  const imagePath = path.join(assetDir, "source.png")
  const promptPath = path.join(tmp, "prompt.md")
  const runDir = path.join(tmp, "run")

  writeFileSync(imagePath, "png")
  writeFileSync(`${imagePath}.url`, "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png\n")
  writePrompt(promptPath, imagePath)

  const payload = parseJSON("payload", run("payload", videoctl, ["payload", promptPath]).stdout)
  if (payload.sourceImageUrl !== "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png") {
    throw new Error(`unexpected sourceImageUrl: ${payload.sourceImageUrl}`)
  }
  result("payload", "resolved local image sidecar into request JSON")

  const dryRun = parseJSON(
    "dry-run",
    run("dry-run", videoctl, ["submit", promptPath, "--dry-run", "--run-dir", runDir, "--json"]).stdout,
  )
  const dryRunStatus = dryRun.status ?? dryRun.Status
  if (dryRunStatus !== "dry_run") throw new Error(`unexpected dry-run status: ${dryRunStatus}`)
  parseJSON("request.json", readFileSync(path.join(runDir, "request.json"), "utf8"))
  result("dry-run", "wrote request.json and state.json")

  const status = parseJSON("status", run("status", videoctl, ["status", runDir, "--json"]).stdout)
  const statusValue = status.status ?? status.Status
  if (statusValue !== "dry_run") throw new Error(`unexpected status: ${statusValue}`)
  result("status", "read dry-run state")

  const port = await freePort()
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", assetDir], {
    stdio: "ignore",
  })
  await sleep(500)
  try {
    writeFileSync(`${imagePath}.url`, `http://127.0.0.1:${port}/source.png\n`)
    const validation = parseJSON(
      "validate",
      run("validate", videoctl, ["validate", promptPath, "--allow-non-oss", "--timeout", "3", "--json"]).stdout,
    )
    if (!validation.ok) throw new Error(`validation failed: ${JSON.stringify(validation, null, 2)}`)
    result("validate", "checked media URL through local HTTP server")
  } finally {
    server.kill()
  }

  console.log("PASS all Phase 7 videoctl smoke checks")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
