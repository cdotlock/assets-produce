import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import {
  handle,
  makeError,
  zodMessage,
} from "@/business/asset-service/http/envelope"
import { AssetServiceError } from "@/business/asset-service/errors"

// Tiny Hono harness so handle() runs the same path it does in production
// without spinning up the whole asset-service mount.
function appWithRoute(run: () => Promise<unknown>) {
  return new Hono().get("/test", async (c) => handle(c, run))
}

describe("envelope.handle", () => {
  test("AssetServiceError → uses its code + message + mapped HTTP status", async () => {
    const app = appWithRoute(async () => {
      throw new AssetServiceError({
        code: "FORBIDDEN",
        op: "test",
        message: "not allowed for project x",
      })
    })
    const res = await app.request("/test")
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe("FORBIDDEN")
    expect(body.error?.message).toBe("not allowed for project x")
  })

  test("non-AssetServiceError → generic 500 'internal error' (M1 regression)", async () => {
    const app = appWithRoute(async () => {
      throw new Error("UNIQUE constraint failed: business_asset.key — internal db state")
    })
    const res = await app.request("/test")
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe("INTERNAL")
    // Raw exception text must NOT reach the client.
    expect(body.error?.message).not.toContain("UNIQUE constraint failed")
    expect(body.error?.message).not.toContain("business_asset.key")
  })

  test("non-Error throws (string, undefined, etc) also surface generically", async () => {
    const app = appWithRoute(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "oops a string-thrown value"
    })
    const res = await app.request("/test")
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe("INTERNAL")
    expect(body.error?.message).not.toContain("oops a string-thrown value")
  })

  test("happy path returns the run() result as-is with status 200", async () => {
    const app = appWithRoute(async () => ({ ok: true, value: 42 }))
    const res = await app.request("/test")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok?: boolean; value?: number }
    expect(body.ok).toBe(true)
    expect(body.value).toBe(42)
  })
})

describe("envelope.makeError + zodMessage", () => {
  test("makeError builds the public envelope shape", () => {
    const out = makeError("INVALID_INPUT", "field 'foo' missing")
    expect(out).toEqual({ error: { code: "INVALID_INPUT", message: "field 'foo' missing" } })
  })

  test("zodMessage formats the first issue with its path", () => {
    const msg = zodMessage([{ path: ["body", "asset_intent", "kind"], message: "Required" }])
    expect(msg).toBe("body.asset_intent.kind: Required")
  })

  test("zodMessage returns generic message for empty issue list", () => {
    expect(zodMessage([])).toBe("invalid input")
  })
})
