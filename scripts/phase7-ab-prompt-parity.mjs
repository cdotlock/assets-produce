#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const referenceRoot = path.join(root, "video-agent-test")
const agentCli = path.join(root, "agent", "dist", "agent.mjs")

function run(label, command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd ?? root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  })
  if (opts.allowFailure) return result
  if (result.status !== 0) {
    throw new Error(
      `${label} failed with ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]))
  }
  return value
}

function assertEqual(label, actual, expected) {
  const a = JSON.stringify(stable(actual), null, 2)
  const e = JSON.stringify(stable(expected), null, 2)
  if (a !== e) throw new Error(`${label} mismatch\nactual:\n${a}\nexpected:\n${e}`)
}

function result(name, detail) {
  console.log(`PASS ${name}: ${detail}`)
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

function writePrompt(filePath, lines) {
  writeFileSync(filePath, `${lines.join("\n")}\n`)
}

const tmp = mkdtempSync(path.join(referenceRoot, ".ab-parity-"))
try {
  const assetDir = path.join(tmp, "assets")
  mkdirSync(assetDir, { recursive: true })
  const relTmp = path.relative(referenceRoot, tmp)
  const urls = {
    source: "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png",
    ref: "https://bucket.oss-cn-shanghai.aliyuncs.com/ref.png",
    last: "https://bucket.oss-cn-shanghai.aliyuncs.com/last.png",
    prev: "https://bucket.oss-cn-shanghai.aliyuncs.com/prev.png",
    video: "https://bucket.oss-cn-shanghai.aliyuncs.com/ref.mp4",
  }
  writeFileSync(path.join(assetDir, "source.png.url"), `${urls.source}\n`)
  writeFileSync(path.join(assetDir, "ref.png.url"), `${urls.ref}\n`)
  writeFileSync(path.join(assetDir, "last.png.url"), `${urls.last}\n`)
  writeFileSync(path.join(assetDir, "prev.png.url"), `${urls.prev}\n`)
  writeFileSync(path.join(assetDir, "ref.mp4.url"), `${urls.video}\n`)

  const basic = path.join(tmp, "case-basic.md")
  writePrompt(basic, [
    "---",
    "shot_id: ab_basic",
    "duration: 12s",
    "ratio: 9:16",
    "resolution: 1080p",
    "assets:",
    "  images:",
    `    - ${relTmp}/assets/source.png`,
    `    - ${relTmp}/assets/ref.png`,
    "  videos: []",
    "---",
    "韩漫画风，2D 动漫风格画风，9:16 竖屏尺寸。",
    "0-2s @图1 角色站定；2-8s 缓慢转身；最后 2s 镜头静止。",
    "禁止：任何字幕、画面内文字、subtitle、caption、logo、watermark。",
  ])

  const continuation = path.join(tmp, "case-continuation.md")
  writePrompt(continuation, [
    "---",
    "shot_id: ab_continuation",
    "duration: 8",
    'ratio: "9:16"',
    `first_frame: ${relTmp}/assets/source.png`,
    `last_frame: ${relTmp}/assets/last.png`,
    `previous_frame_url: ${relTmp}/assets/prev.png`,
    `previous_video_url: ${relTmp}/assets/ref.mp4`,
    "continuation_tail_seconds: 2s",
    "assets:",
    "  images:",
    `    - ${relTmp}/assets/ref.png`,
    "  videos:",
    `    - ${relTmp}/assets/ref.mp4`,
    "---",
    "Prompt body line one.",
    "Prompt body line two with @图1 and 0-2s timing.",
  ])

  const textOnly = path.join(tmp, "case-text-only.md")
  writePrompt(textOnly, [
    "---",
    "shot_id: ab_text_only",
    "duration: 6s",
    "ratio: 9:16",
    "assets:",
    "  images: []",
    "  videos: []",
    "---",
    "Text-only prompt body for dry payload comparison.",
  ])

  const invalidDuration = path.join(tmp, "case-invalid-duration.md")
  writePrompt(invalidDuration, [
    "---",
    "shot_id: ab_invalid_duration",
    "duration: twelve",
    "ratio: 9:16",
    "assets:",
    "  images:",
    `    - ${relTmp}/assets/source.png`,
    "---",
    "Invalid duration prompt body.",
  ])

  for (const [name, file, extra] of [
    ["basic payload", basic, []],
    ["continuation payload", continuation, []],
    ["text-only payload", textOnly, ["--allow-text-only"]],
  ]) {
    const go = parseJSON(
      name,
      run(`videoctl ${name}`, "go", ["run", "./scripts/videoctl", "payload", file, ...extra], { cwd: referenceRoot }).stdout,
    )
    const agent = parseJSON(
      name,
      run(`agent ${name}`, "bun", [agentCli, "video", "payload", file, "--output", "json", ...extra], { cwd: referenceRoot }).stdout,
    )
    assertEqual(name, agent, go)
    if (agent.prompt !== go.prompt) throw new Error(`${name} prompt field changed`)
    result(name, "payload JSON and prompt field match reference videoctl")
  }

  const goInvalid = run("videoctl invalid duration", "go", ["run", "./scripts/videoctl", "payload", invalidDuration], {
    cwd: referenceRoot,
    allowFailure: true,
  })
  const agentInvalid = run("agent invalid duration", "bun", [agentCli, "video", "payload", invalidDuration, "--output", "json"], {
    cwd: referenceRoot,
    allowFailure: true,
  })
  if (goInvalid.status === 0 || agentInvalid.status === 0) throw new Error("invalid duration should fail on both sides")
  result("invalid duration", `both failed: videoctl=${goInvalid.status}, agent=${agentInvalid.status}`)

  const goRunDir = path.join(tmp, "go-run")
  const agentRunDir = path.join(tmp, "agent-run")
  run("videoctl dry-run", "go", ["run", "./scripts/videoctl", "submit", basic, "--dry-run", "--run-dir", goRunDir, "--json"], {
    cwd: referenceRoot,
  })
  run("agent dry-run", "bun", [agentCli, "video", "submit", basic, "--dry-run", "--run-dir", agentRunDir, "--output", "json"], {
    cwd: referenceRoot,
  })
  assertEqual(
    "dry-run request.json",
    parseJSON("agent request.json", readFileSync(path.join(agentRunDir, "request.json"), "utf8")),
    parseJSON("videoctl request.json", readFileSync(path.join(goRunDir, "request.json"), "utf8")),
  )
  result("dry-run request", "request.json matches reference videoctl")

  writeFileSync(path.join(assetDir, "source.png"), "pngbytes")
  writeFileSync(path.join(assetDir, "ref.png"), "pngbytes")
  const port = await freePort()
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", assetDir], {
    stdio: "ignore",
  })
  await sleep(500)
  try {
    writeFileSync(path.join(assetDir, "source.png.url"), `http://127.0.0.1:${port}/source.png\n`)
    writeFileSync(path.join(assetDir, "ref.png.url"), `http://127.0.0.1:${port}/ref.png\n`)
    const goValidate = parseJSON(
      "videoctl validate",
      run("videoctl validate", "go", ["run", "./scripts/videoctl", "validate", basic, "--allow-non-oss", "--timeout", "3", "--json"], {
        cwd: referenceRoot,
      }).stdout,
    )
    const agentValidate = parseJSON(
      "agent validate",
      run("agent validate", "bun", [agentCli, "video", "validate", basic, "--allow-non-oss", "--timeout", "3", "--output", "json"], {
        cwd: referenceRoot,
      }).stdout,
    )
    const normalize = (value) => ({
      ok: value.ok,
      results: value.results.map((item) => ({
        ok: item.ok,
        expected: item.expected,
        content_type: item.content_type ?? item.contentType,
        source: item.source ?? "",
      })),
    })
    assertEqual("validate normalized results", normalize(agentValidate), normalize(goValidate))
    result("validate", "normalized URL validation results match reference videoctl")
  } finally {
    server.kill()
  }

  console.log("PASS all Phase 7 prompt-only AB parity checks")
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
