import { describe, expect, test } from "bun:test"
import { Cause } from "effect"
import { ExitCode } from "../../src/cli/errors/codes"
import { formatError, router } from "../../src/cli/errors/router"

describe("cli/errors/router", () => {
  test("router(null) → SUCCESS", () => {
    expect(router(null)).toBe(ExitCode.SUCCESS)
    expect(router(undefined)).toBe(ExitCode.SUCCESS)
  })

  test("network errno on Error → NETWORK", () => {
    expect(router(new Error("ECONNREFUSED 127.0.0.1:8001"))).toBe(ExitCode.NETWORK)
    const errnoErr = Object.assign(new Error("connect failed"), { code: "ENOTFOUND" })
    expect(router(errnoErr)).toBe(ExitCode.NETWORK)
  })

  test("ProviderAuthValidationFailed → AUTH", () => {
    expect(router({ name: "ProviderAuthValidationFailed", message: "no key" })).toBe(ExitCode.AUTH)
  })

  test("RateLimitError → QUOTA", () => {
    expect(router({ name: "RateLimitError", message: "429" })).toBe(ExitCode.QUOTA)
    expect(router({ name: "ProviderRateLimitError", message: "429" })).toBe(ExitCode.QUOTA)
    expect(router({ name: "QuotaError", message: "..." })).toBe(ExitCode.QUOTA)
    expect(router({ name: "ProviderQuotaError", message: "..." })).toBe(ExitCode.QUOTA)
  })

  test("RequestTimeout / *TimeoutError → TIMEOUT", () => {
    expect(router({ name: "RequestTimeout", message: "120s" })).toBe(ExitCode.TIMEOUT)
    expect(router({ name: "TimeoutError", message: "120s" })).toBe(ExitCode.TIMEOUT)
    expect(router({ name: "ProviderTimeoutError", message: "120s" })).toBe(ExitCode.TIMEOUT)
  })

  test("loose substring names no longer match (e.g. NoAuthRequired) → GENERAL", () => {
    // Tightened classifier: `.includes("Auth")` would have wrongly bucketed these.
    expect(router({ name: "NoAuthRequired", message: "skip" })).toBe(ExitCode.GENERAL)
    expect(router({ name: "UnauthorizedAccess", message: "..." })).toBe(ExitCode.GENERAL)
    // Same for old bare-substring buckets — no `.includes("Quota")` / `.includes("Timeout")`.
    expect(router({ name: "QuotaExhausted", message: "..." })).toBe(ExitCode.GENERAL)
    expect(router({ name: "TimeoutScheduler", message: "..." })).toBe(ExitCode.GENERAL)
  })

  test("Cause.fail wrapping NotFoundError → GENERAL", () => {
    const cause = Cause.fail({ name: "NotFoundError", message: "user not found" })
    expect(router(cause)).toBe(ExitCode.GENERAL)
  })

  test("plain Error → GENERAL", () => {
    expect(router(new Error("oops"))).toBe(ExitCode.GENERAL)
  })

  test("ContentFilter / ContentBlocked → CONTENT_FILTER", () => {
    expect(router({ name: "ContentFilter", message: "..." })).toBe(ExitCode.CONTENT_FILTER)
    expect(router({ name: "ProviderContentFilter", message: "..." })).toBe(ExitCode.CONTENT_FILTER)
    expect(router({ name: "ContentBlocked", message: "..." })).toBe(ExitCode.CONTENT_FILTER)
  })

  test("Cause containing Interrupt → GENERAL", () => {
    expect(router(Cause.interrupt(0))).toBe(ExitCode.GENERAL)
  })

  test("formatError on plain Error returns single-line message + GENERAL", () => {
    expect(formatError(new Error("hello"))).toEqual({ exitCode: ExitCode.GENERAL, message: "hello" })
  })

  test("formatError on NamedError-style { data: { op, message } } shapes message", () => {
    const err = { name: "FooFailed", data: { op: "foo", message: "boom" } }
    const cause = Cause.fail(err)
    expect(formatError(cause)).toEqual({ exitCode: ExitCode.GENERAL, message: "[foo] boom" })
  })

  test("formatError on auth Cause maps to AUTH and surfaces inner message", () => {
    const err = Object.assign(new Error("invalid key"), { name: "ProviderAuthValidationFailed" })
    const cause = Cause.fail(err)
    expect(formatError(cause)).toEqual({ exitCode: ExitCode.AUTH, message: "invalid key" })
  })

  test("formatError on null returns SUCCESS / empty message", () => {
    expect(formatError(null)).toEqual({ exitCode: ExitCode.SUCCESS, message: "" })
  })
})
