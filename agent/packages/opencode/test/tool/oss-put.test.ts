import { describe, expect, test } from "bun:test"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeOssPutTool, Parameters as OssPutParameters } from "@/tool/asset/oss-put"
import type { Tool } from "@/tool/tool"

const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

// Minimal Tool.Context for tests — mirrors generate-sfx-elevenlabs.test.ts.
const ctx = (): Tool.Context => ({
  sessionID: SessionID.descending(),
  messageID: MessageID.ascending(),
  abort: new AbortController().signal,
  callID: "call_test",
  agent: "build",
  messages: [],
  metadata() {
    return Effect.void
  },
  ask() {
    return Effect.void
  },
})

interface OssCall {
  key: string
  size: number
}

// Injectable OSS uploader stub — keeps tests off ali-oss / network.
function stubUploader(
  sink?: OssCall[],
  override?: (key: string, body: Buffer) => Promise<string>,
): (key: string, body: Buffer) => Promise<string> {
  return async (key, body) => {
    sink?.push({ key, size: body.length })
    if (override) return override(key, body)
    return `https://bucket.oss-cn-shanghai.aliyuncs.com/${key}`
  }
}

async function buildExec(uploader = stubUploader()) {
  const info = await runtime.runPromise(makeOssPutTool({ uploader }))
  return Effect.runPromise(info.init())
}

// Create a unique temp file with given bytes; return its absolute path.
function tmpFile(name: string, bytes: Buffer | number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oss-put-test-"))
  const p = path.join(dir, name)
  fs.writeFileSync(p, typeof bytes === "number" ? Buffer.alloc(bytes) : bytes)
  return p
}

describe("oss-put atomic tool", () => {
  test("dryRun=true → no upload, output is resolved JSON (not https), metadata.dryRun true", async () => {
    const ossCalls: OssCall[] = []
    const def = await buildExec(stubUploader(ossCalls))
    const local = tmpFile("pic.png", Buffer.alloc(128, 9))

    const out = await runtime.runPromise(def.execute({ local_path: local, dryRun: true }, ctx()))

    expect(ossCalls).toHaveLength(0)
    expect(out.output).not.toMatch(/^https:\/\//)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("oss-put")
    expect(parsed.dryRun).toBe(true)
    expect(typeof parsed.key).toBe("string")
    expect(parsed.key).toMatch(/^assets\/.+\.png$/)
    const meta = out.metadata as { dryRun?: boolean; key?: string }
    expect(meta.dryRun).toBe(true)
    expect(meta.key).toBe(parsed.key)
  })

  test("happy path → uploads temp file, output is bare https URL, metadata mirrors it", async () => {
    const ossCalls: OssCall[] = []
    const def = await buildExec(stubUploader(ossCalls))
    const body = Buffer.alloc(4096, 3)
    const local = tmpFile("frame.png", body)

    const out = await runtime.runPromise(def.execute({ local_path: local }, ctx()))

    expect(ossCalls).toHaveLength(1)
    expect(ossCalls[0]!.key).toMatch(/^assets\/.+\.png$/)
    expect(ossCalls[0]!.size).toBe(body.length)

    expect(out.output).toMatch(/^https:\/\/bucket\.oss-cn-shanghai\.aliyuncs\.com\/assets\/.+\.png$/)
    const meta = out.metadata as {
      ossUrl?: string
      key?: string
      content_type?: string
      local_path?: string
      error?: boolean
    }
    expect(meta.ossUrl).toBe(out.output)
    expect(meta.key).toBe(ossCalls[0]!.key)
    expect(meta.local_path).toBe(path.resolve(local))
    expect(meta.error).toBeUndefined()
  })

  test("oss_prefix honored, leading/trailing slashes trimmed", async () => {
    const ossCalls: OssCall[] = []
    const def = await buildExec(stubUploader(ossCalls))
    const local = tmpFile("cg.png", Buffer.alloc(256, 1))

    const out = await runtime.runPromise(
      def.execute({ local_path: local, oss_prefix: "/assets/cg/" }, ctx()),
    )

    expect(ossCalls[0]!.key).toMatch(/^assets\/cg\/.+\.png$/)
    expect(out.output).toContain("/assets/cg/")
  })

  test("content_type selects key extension when local file has none", async () => {
    const ossCalls: OssCall[] = []
    const def = await buildExec(stubUploader(ossCalls))
    const local = tmpFile("noext", Buffer.alloc(64, 2))

    const out = await runtime.runPromise(
      def.execute({ local_path: local, content_type: "image/jpeg" }, ctx()),
    )

    expect(ossCalls[0]!.key).toMatch(/^assets\/.+\.jpg$/)
    const meta = out.metadata as { content_type?: string }
    expect(meta.content_type).toBe("image/jpeg")
  })

  test("non-existent path → folded error, metadata.error true, uploader not called", async () => {
    const ossCalls: OssCall[] = []
    const def = await buildExec(stubUploader(ossCalls))
    const missing = path.join(os.tmpdir(), "oss-put-does-not-exist-xyz", "nope.png")

    const out = await runtime.runPromise(def.execute({ local_path: missing }, ctx()))

    expect(ossCalls).toHaveLength(0)
    expect(out.title.endsWith("failed")).toBe(true)
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("empty (0-byte) file → folded error, uploader not called", async () => {
    const ossCalls: OssCall[] = []
    const def = await buildExec(stubUploader(ossCalls))
    const local = tmpFile("empty.png", 0)

    const out = await runtime.runPromise(def.execute({ local_path: local }, ctx()))

    expect(ossCalls).toHaveLength(0)
    expect(out.title.endsWith("failed")).toBe(true)
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("relative (non-absolute) path → folded error, uploader not called", async () => {
    const ossCalls: OssCall[] = []
    const def = await buildExec(stubUploader(ossCalls))

    const out = await runtime.runPromise(def.execute({ local_path: "relative/file.png" }, ctx()))

    expect(ossCalls).toHaveLength(0)
    expect(out.title.endsWith("failed")).toBe(true)
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("uploader throws (OSSError) → folded error, no throw, output contains OSS_BUCKET", async () => {
    const def = await buildExec(
      stubUploader(undefined, async () => {
        throw new Error("OSS env missing: OSS_BUCKET")
      }),
    )
    const local = tmpFile("x.png", Buffer.alloc(128, 5))

    const out = await runtime.runPromise(def.execute({ local_path: local }, ctx()))

    expect(out.title.endsWith("failed")).toBe(true)
    expect((out.metadata as { error?: boolean }).error).toBe(true)
    expect(out.output).toContain("OSS_BUCKET")
  })

  test("schema rejects missing local_path", () => {
    const decode = Schema.decodeUnknownEffect(OssPutParameters)
    const exit = Effect.runSyncExit(decode({}))
    expect(exit._tag).toBe("Failure")
  })

  test("schema rejects empty-string local_path", () => {
    const decode = Schema.decodeUnknownEffect(OssPutParameters)
    const exit = Effect.runSyncExit(decode({ local_path: "" }))
    expect(exit._tag).toBe("Failure")
  })

  test("schema accepts a well-formed full input", () => {
    const decode = Schema.decodeUnknownEffect(OssPutParameters)
    const exit = Effect.runSyncExit(
      decode({
        local_path: "/tmp/out/frame.png",
        oss_prefix: "assets/cg",
        content_type: "image/png",
        dryRun: false,
      }),
    )
    expect(exit._tag).toBe("Success")
  })
})
