import { describe, expect, test } from "bun:test"
import {
  GLOBAL_OPTIONS,
  helpFor,
  toJsonSchema,
  toYargsBuilder,
  type OptionDef,
} from "../../src/cli/option-def"

interface YargsCall {
  name: string
  config: Record<string, unknown>
}

function makeMockYargs(): { calls: YargsCall[]; argv: ReturnType<typeof build> } {
  const calls: YargsCall[] = []
  const argv = build(calls)
  return { calls, argv }
  function build(sink: YargsCall[]): {
    option(name: string, config: Record<string, unknown>): unknown
  } {
    const self = {
      option(name: string, config: Record<string, unknown>) {
        sink.push({ name, config })
        return self
      },
    }
    return self
  }
}

describe("OptionDef adapter", () => {
  describe("toYargsBuilder", () => {
    test("derives yargs option name from --flag <value> form", () => {
      const { calls, argv } = makeMockYargs()
      const opts: OptionDef[] = [
        { flag: "--username <name>", description: "username", type: "string", required: true },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toYargsBuilder(argv as any, opts)
      expect(calls.length).toBe(1)
      expect(calls[0]!.name).toBe("username")
      expect(calls[0]!.config).toMatchObject({
        type: "string",
        describe: "username",
        demandOption: true,
      })
    })

    test("derives yargs option name from boolean --no-arg flag", () => {
      const { calls, argv } = makeMockYargs()
      const opts: OptionDef[] = [{ flag: "--dry-run", description: "dry run", type: "boolean" }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toYargsBuilder(argv as any, opts)
      expect(calls.length).toBe(1)
      expect(calls[0]!.name).toBe("dry-run")
      expect(calls[0]!.config).toMatchObject({
        type: "boolean",
        describe: "dry run",
      })
      expect(calls[0]!.config.demandOption).toBeFalsy()
    })

    test("maps array type to yargs array+string", () => {
      const { calls, argv } = makeMockYargs()
      const opts: OptionDef[] = [{ flag: "--file <path>", description: "files", type: "array" }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toYargsBuilder(argv as any, opts)
      expect(calls.length).toBe(1)
      expect(calls[0]!.config).toMatchObject({
        type: "string",
        array: true,
        describe: "files",
      })
    })

    test("merges extra yargs options (choices / coerce / conflicts)", () => {
      const { calls, argv } = makeMockYargs()
      const opts: OptionDef[] = [
        {
          flag: "--role <role>",
          description: "role",
          type: "string",
          required: true,
          extra: { choices: ["admin", "creator"] as const },
        },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toYargsBuilder(argv as any, opts)
      expect(calls.length).toBe(1)
      expect(calls[0]!.config).toMatchObject({
        type: "string",
        describe: "role",
        demandOption: true,
        choices: ["admin", "creator"],
      })
    })

    test("chains option calls and returns the yargs instance", () => {
      const { calls, argv } = makeMockYargs()
      const opts: OptionDef[] = [
        { flag: "--a", description: "a", type: "boolean" },
        { flag: "--b <v>", description: "b", type: "string" },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = toYargsBuilder(argv as any, opts)
      expect(calls.length).toBe(2)
      expect(calls[0]!.name).toBe("a")
      expect(calls[1]!.name).toBe("b")
      expect(result).toBe(argv as never)
    })
  })

  describe("toJsonSchema", () => {
    test("produces one entry per OptionDef with correct types", () => {
      const opts: OptionDef[] = [
        { flag: "--username <name>", description: "username", type: "string", required: true },
        { flag: "--retries <n>", description: "retry count", type: "number" },
        { flag: "--quiet", description: "quiet mode", type: "boolean" },
      ]
      const schema = toJsonSchema(opts)
      expect(Object.keys(schema).length).toBe(3)
      expect(schema.username).toEqual({
        type: "string",
        description: "username",
        required: true,
      })
      expect(schema.retries).toEqual({
        type: "number",
        description: "retry count",
      })
      expect(schema.quiet).toEqual({
        type: "boolean",
        description: "quiet mode",
      })
    })

    test("default type is string when omitted", () => {
      const opts: OptionDef[] = [{ flag: "--label <s>", description: "label" }]
      const schema = toJsonSchema(opts)
      expect(schema.label!.type).toBe("string")
    })
  })

  describe("helpFor", () => {
    test("emits cmd name as first line and one indented line per option", () => {
      const opts: OptionDef[] = [
        { flag: "--username <name>", description: "username", type: "string", required: true },
        { flag: "--dry-run", description: "dry run mode", type: "boolean" },
      ]
      const out = helpFor("users add", opts)
      const lines = out.split("\n")
      expect(lines[0]).toBe("users add")
      expect(lines.some((l) => l.includes("--username") && l.includes("username"))).toBe(true)
      expect(lines.some((l) => l.includes("--dry-run") && l.includes("dry run mode"))).toBe(true)
    })
  })

  describe("GLOBAL_OPTIONS", () => {
    test("contains the documented core flags", () => {
      const flags = GLOBAL_OPTIONS.map((o) => o.flag.split(" ")[0])
      // Required minimum per Phase 6 plan § 0.1 + Task 1 brief.
      for (const expected of [
        "--api-key",
        "--base-url",
        "--output",
        "--quiet",
        "--verbose",
        "--no-color",
        "--dry-run",
        "--non-interactive",
        "--help",
        "--version",
      ]) {
        expect(flags).toContain(expected)
      }
    })

    test("each entry has a description", () => {
      for (const o of GLOBAL_OPTIONS) {
        expect(typeof o.description).toBe("string")
        expect(o.description.length).toBeGreaterThan(0)
      }
    })
  })
})
