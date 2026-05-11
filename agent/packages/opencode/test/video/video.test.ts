import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { Agent } from "../../src/agent/agent"
import { buildPayload } from "../../src/video/payload"
import { Instance } from "../../src/project/instance"
import { readState, writeDryRun, createRunDir } from "../../src/video/runstate"
import { validatePrompt } from "../../src/video/validate"
import { comparePromptFiles, reviewPromptFile } from "../../src/video/review"
import { VideoSubmitCommand } from "../../src/cli/cmd/video"
import { MessageID, SessionID } from "../../src/session/schema"
import { VideoCtlTool } from "../../src/tool/videoctl"
import { Truncate } from "../../src/tool/truncate"
import type { Tool } from "../../src/tool/tool"

const tempDirs: string[] = []
const servers: Array<{ stop: (closeActiveConnections?: boolean) => void }> = []
const toolRuntime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop(true)
  for (const dir of tempDirs.splice(0)) await fs.rm(dir, { recursive: true, force: true })
})

async function makeTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-video-test-"))
  tempDirs.push(dir)
  await fs.mkdir(path.join(dir, "assets"), { recursive: true })
  await fs.writeFile(path.join(dir, "assets", "source.png"), "placeholder")
  return dir
}

function promptText(assetRef: string): string {
  return [
    "---",
    "shot_id: test_shot_1",
    "duration: 12s",
    "ratio: 9:16",
    "shot_function: |",
    "  Sylvia chooses action instead of waiting.",
    "prev_shot_recap: |",
    "  Previous shot ended in silence.",
    "next_shot_setup: |",
    "  Next shot starts at the manor door.",
    "assets:",
    "  images:",
    `    - ${assetRef}`,
    "  videos: []",
    "---",
    "",
    "全画面严格采用韩漫2D动漫风格，9:16 竖屏。全程无字幕、无画面内文字、无角色名标注、无 subtitle、无 caption、无 logo、无 watermark、无水印。",
    "",
    "画面中 Sylvia 始终仅为一人，严禁角色分身/复制/同时出现在画面不同位置。James 始终仅为一人。",
    "",
    "@图1 是公墓场景图，锁定空间关系。故事线：Sylvia 逼问 James 等不到答案后转身离开，情绪从压抑等待到主动放弃等待。",
    "",
    "关键场景：0-2s @图1 Sylvia 静止抬头，2-5s James 沉默不答，5-8s Sylvia 转身向画面右侧走，8-11s James 喊她名字但她不回头；最后 2s 三重静止，镜头完全停止移动，画面保持静止构图。",
    "",
    "音效层：环境音【冷风】| 动作音【脚步声】| 对白【word-level lip-sync】| 配乐【低弦乐】。",
    "",
    "禁止：任何字幕、画面内文字、角色名标注、subtitle、caption、logo、watermark、水印、人物瞬移、镜头跳跃、空间关系改变、最后 2s 继续运动。",
    "",
    "素材上传清单：@图1: assets/source.png。",
  ].join("\n")
}

function makeToolContext(): Tool.Context {
  return {
    sessionID: SessionID.descending(),
    messageID: MessageID.ascending(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata() {
      return Effect.void
    },
    ask() {
      return Effect.void
    },
  }
}

describe("video prompt payload", () => {
  test("builds payload from prompt frontmatter and sidecar URL", async () => {
    const root = await makeTempProject()
    const mediaURL = "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png"
    await fs.writeFile(path.join(root, "assets", "source.png.url"), `${mediaURL}\n`)
    const promptPath = path.join(root, "prompt.md")
    await fs.writeFile(promptPath, promptText("assets/source.png"))

    const payload = await buildPayload(promptPath, { projectRoot: root })
    expect(payload.ratio).toBe("9:16")
    expect(payload.duration).toBe(12)
    expect(payload.sourceImageUrl).toBe(mediaURL)
    expect(payload.prompt).toContain("关键场景")
  })

  test("rejects local asset without sidecar", async () => {
    const root = await makeTempProject()
    const promptPath = path.join(root, "prompt.md")
    await fs.writeFile(promptPath, promptText("assets/source.png"))
    await expect(buildPayload(promptPath, { projectRoot: root })).rejects.toThrow("without an OSS sidecar")
  })

  test("matches videoctl payload semantics for previous media and duration errors", async () => {
    const root = await makeTempProject()
    const imageURL = "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png"
    const lastURL = "https://bucket.oss-cn-shanghai.aliyuncs.com/last.png"
    const videoURL = "https://bucket.oss-cn-shanghai.aliyuncs.com/ref.mp4"
    await fs.writeFile(path.join(root, "assets", "source.png.url"), `${imageURL}\n`)
    await fs.writeFile(path.join(root, "assets", "last.png.url"), `${lastURL}\n`)
    await fs.writeFile(path.join(root, "assets", "ref.mp4.url"), `${videoURL}\n`)
    const promptPath = path.join(root, "continuation.md")
    await fs.writeFile(
      promptPath,
      [
        "---",
        "duration: 8",
        "ratio: 9:16",
        "first_frame: assets/source.png",
        "previous_frame_url: assets/last.png",
        "previous_video_url: assets/ref.mp4",
        "assets:",
        "  images:",
        "    - assets/last.png",
        "  videos:",
        "    - assets/ref.mp4",
        "---",
        "Continuation prompt body.",
      ].join("\n"),
    )

    const payload = await buildPayload(promptPath, { projectRoot: root })
    expect(payload.referenceImageUrls).toEqual([lastURL])
    expect(payload.sourceVideoUrls).toEqual([videoURL])

    await fs.writeFile(
      promptPath,
      ["---", "duration: twelve", "assets:", "  images:", "    - assets/source.png", "---", "Invalid."].join("\n"),
    )
    await expect(buildPayload(promptPath, { projectRoot: root })).rejects.toThrow("invalid duration")
  })
})

describe("video prompt validation and dry-run state", () => {
  test("validates media URLs with a local HTTP server", async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response("image", { headers: { "content-type": "image/png", "content-length": "5" } })
      },
    })
    servers.push(server)

    const root = await makeTempProject()
    const mediaURL = `http://127.0.0.1:${server.port}/source.png`
    await fs.writeFile(path.join(root, "assets", "source.png.url"), `${mediaURL}\n`)
    const promptPath = path.join(root, "prompt.md")
    await fs.writeFile(promptPath, promptText("assets/source.png"))

    const result = await validatePrompt(promptPath, { projectRoot: root, allowNonOSS: true, timeoutMs: 2_000 })
    expect(result.ok).toBe(true)
    expect(result.results[0]?.contentType).toBe("image/png")
  })

  test("writes and reads dry-run request state", async () => {
    const root = await makeTempProject()
    const mediaURL = "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png"
    await fs.writeFile(path.join(root, "assets", "source.png.url"), `${mediaURL}\n`)
    const promptPath = path.join(root, "prompt.md")
    await fs.writeFile(promptPath, promptText("assets/source.png"))
    const payload = await buildPayload(promptPath, { projectRoot: root })

    const runDir = await createRunDir(promptPath, path.join(root, "run"))
    await writeDryRun(runDir, promptPath, payload)
    const state = await readState(runDir)
    expect(state.status).toBe("dry_run")
    expect(await fs.readFile(path.join(runDir, "request.json"), "utf8")).toContain(mediaURL)
  })

  test("CLI submit dry-run writes default prompt-local run artifacts", async () => {
    const root = await makeTempProject()
    const mediaURL = "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png"
    await fs.writeFile(path.join(root, "assets", "source.png.url"), `${mediaURL}\n`)
    const promptPath = path.join(root, "prompt.md")
    await fs.writeFile(promptPath, promptText("assets/source.png"))

    let output = ""
    const originalWrite = process.stdout.write
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += String(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      await VideoSubmitCommand.handler?.({
        prompt: promptPath,
        "dry-run": true,
        json: true,
      } as never)
    } finally {
      process.stdout.write = originalWrite
    }

    const parsed = JSON.parse(output) as { runDir: string; state: { status: string } }
    expect(parsed.state.status).toBe("dry_run")
    expect(parsed.runDir.startsWith(path.join(root, "runs"))).toBe(true)
    expect(await fs.readFile(path.join(parsed.runDir, "request.json"), "utf8")).toContain(mediaURL)
    expect((await readState(parsed.runDir)).status).toBe("dry_run")
  })
})

describe("videoctl opencode tool", () => {
  test("wraps payload, dry-run submit, status, and prompt review locally", async () => {
    const root = await makeTempProject()
    const mediaURL = "https://bucket.oss-cn-shanghai.aliyuncs.com/source.png"
    await fs.writeFile(path.join(root, "assets", "source.png.url"), `${mediaURL}\n`)
    const promptPath = path.join(root, "prompt.md")
    await fs.writeFile(promptPath, promptText("assets/source.png"))

    await Instance.provide({
      directory: root,
      async fn() {
        const info = await toolRuntime.runPromise(VideoCtlTool)
        const tool = await Effect.runPromise(info.init())
        const ctx = makeToolContext()

        const payload = await Effect.runPromise(
          tool.execute({ operation: "payload", promptPath, projectRoot: root }, ctx),
        )
        expect(JSON.parse(payload.output).sourceImageUrl).toBe(mediaURL)

        const runDir = path.join(root, "video-run")
        const dryRun = await Effect.runPromise(
          tool.execute({ operation: "submit_dry_run", promptPath, projectRoot: root, runDir }, ctx),
        )
        const dryRunOutput = JSON.parse(dryRun.output)
        expect(dryRunOutput.status).toBe("dry_run")
        expect(dryRunOutput.runDir).toBe(runDir)

        const status = await Effect.runPromise(tool.execute({ operation: "status", runDir }, ctx))
        expect(JSON.parse(status.output).status).toBe("dry_run")

        const review = await Effect.runPromise(tool.execute({ operation: "prompt_review", promptPath }, ctx))
        expect(JSON.parse(review.output).score).toBeGreaterThan(0)
      },
    })
  })
})

describe("video prompt review", () => {
  test("scores and compares prompt structure", async () => {
    const root = await makeTempProject()
    const promptPath = path.join(root, "prompt.md")
    await fs.writeFile(promptPath, promptText("https://bucket.oss-cn-shanghai.aliyuncs.com/source.png"))

    const review = await reviewPromptFile(promptPath)
    expect(review.score).toBeGreaterThanOrEqual(90)

    const compare = await comparePromptFiles(promptPath, promptPath)
    expect(compare.score).toBe(100)
    expect(compare.deltas.bodyLength).toBe(0)
  })
})
