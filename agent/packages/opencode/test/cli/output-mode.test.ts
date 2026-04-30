import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { isNoColor, isNonInteractive, outputMode } from "../../src/cli/output/mode"
import { getGlobalContext } from "../../src/cli/global-context"

/**
 * Phase 6 Task 4.7 — coverage for the pure output-mode helpers + global
 * context defaults. Each test mutates a small set of `process.env` keys and
 * the original values are restored after.
 */

const ENV_KEYS = ["CI", "NO_COLOR"] as const

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}
let savedIsTTY: boolean | undefined

beforeEach(() => {
  saved = {}
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  savedIsTTY = process.stdout.isTTY
  // Default: pretend we are an interactive shell so outputMode default test
  // is deterministic across local + CI runs.
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true })
  delete process.env.CI
  delete process.env.NO_COLOR
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  if (savedIsTTY === undefined) {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: undefined })
  } else {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: savedIsTTY })
  }
})

describe("outputMode", () => {
  test("defaults to tty when no flags / env", () => {
    expect(outputMode()).toBe("tty")
    expect(outputMode({})).toBe("tty")
  })

  test("--output json wins", () => {
    expect(outputMode({ output: "json" })).toBe("json")
  })

  test("--output text → tty", () => {
    expect(outputMode({ output: "text" })).toBe("tty")
  })

  test("CI=true forces json", () => {
    process.env.CI = "true"
    expect(outputMode()).toBe("json")
  })

  test("CI=1 also forces json", () => {
    process.env.CI = "1"
    expect(outputMode()).toBe("json")
  })

  test("non-TTY stdout (false) → json", () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false })
    expect(outputMode()).toBe("json")
  })

  test("non-TTY stdout (undefined / piped) → json", () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: undefined })
    expect(outputMode()).toBe("json")
  })

  test("explicit --output text overrides CI=true", () => {
    process.env.CI = "true"
    expect(outputMode({ output: "text" })).toBe("tty")
  })
})

describe("isNonInteractive", () => {
  test("--non-interactive → true", () => {
    expect(isNonInteractive({ nonInteractive: true })).toBe(true)
  })

  test("CI=true → true", () => {
    process.env.CI = "true"
    expect(isNonInteractive()).toBe(true)
  })

  test("CI=1 → true", () => {
    process.env.CI = "1"
    expect(isNonInteractive()).toBe(true)
  })

  test("default → false", () => {
    expect(isNonInteractive()).toBe(false)
    expect(isNonInteractive({})).toBe(false)
  })
})

describe("isNoColor", () => {
  test("--no-color → true", () => {
    expect(isNoColor({ noColor: true })).toBe(true)
  })

  test("CI=true → true", () => {
    process.env.CI = "true"
    expect(isNoColor()).toBe(true)
  })

  test("NO_COLOR=1 → true", () => {
    process.env.NO_COLOR = "1"
    expect(isNoColor()).toBe(true)
  })

  test("NO_COLOR= (empty string) → true (de-facto: any value disables)", () => {
    process.env.NO_COLOR = ""
    expect(isNoColor()).toBe(true)
  })

  test("default → false", () => {
    expect(isNoColor()).toBe(false)
  })
})

describe("getGlobalContext", () => {
  test("returns defaults when unset", () => {
    // Note: this assumes setGlobalContext has not been called by an earlier
    // test in the same file. The middleware only fires under index.ts entry,
    // not in unit tests, so this should be safe.
    expect(getGlobalContext()).toEqual({
      output: "tty",
      dryRun: false,
      nonInteractive: false,
      noColor: false,
      quiet: false,
      verbose: false,
    })
  })
})
