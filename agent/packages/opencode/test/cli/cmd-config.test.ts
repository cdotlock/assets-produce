import { describe, expect, test } from "bun:test"
import { CLI_COMMAND_DESCRIPTORS, getCatalog, parseEnvExample } from "../../src/cli/cmd/config"
import { networkOptionDefs } from "../../src/cli/network"

describe("config: CLI_COMMAND_DESCRIPTORS", () => {
  test("includes all 22 P1 leaf commands", () => {
    // users(4) + tools(4) + skills(8) + oss(3) + run + serve + models = 22
    expect(CLI_COMMAND_DESCRIPTORS.length).toBe(22)
  })

  test("each entry has a kebab-case name and non-empty description", () => {
    for (const desc of CLI_COMMAND_DESCRIPTORS) {
      expect(desc.name).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(desc.description.length).toBeGreaterThan(0)
    }
  })

  test("contains the canonical P1 leaf names", () => {
    const names = new Set(CLI_COMMAND_DESCRIPTORS.map((d) => d.name))
    for (const expected of [
      "users-add",
      "users-list",
      "users-passwd",
      "users-delete",
      "tools-list",
      "tools-show",
      "tools-call",
      "tools-export-schema",
      "skills-add",
      "skills-update",
      "skills-delete",
      "skills-list",
      "skills-enable",
      "skills-disable",
      "skills-show",
      "skills-export-schema",
      "oss-put",
      "oss-get",
      "oss-list",
      "run",
      "serve",
      "models",
    ]) {
      expect(names.has(expected)).toBe(true)
    }
  })

  test("oss-put exposes both 'local' and 'key' as required positionals", () => {
    const ossPut = CLI_COMMAND_DESCRIPTORS.find((d) => d.name === "oss-put")
    expect(ossPut).toBeDefined()
    expect(ossPut!.positionals).toEqual([
      { name: "local", description: "path of local file", required: true },
      { name: "key", description: "OSS object key", required: true },
    ])
  })

  test("every flag option has a non-empty description", () => {
    for (const desc of CLI_COMMAND_DESCRIPTORS) {
      for (const opt of desc.options) {
        expect(opt.description.length).toBeGreaterThan(0)
      }
    }
  })

  test("schema catalog's `serve` entry stays in sync with networkOptionDefs", () => {
    // Mirror flagToName from option-def.ts: strip `--` prefix and any
    // `<placeholder>` value form so `--port <port>` → `port`.
    const flagToName = (flag: string): string =>
      (flag.split(/\s+/)[0] ?? flag).replace(/^--?/, "")
    const expectedNames = networkOptionDefs.map((o) => flagToName(o.flag))
    const { tools } = getCatalog({ filter: "serve" })
    expect(tools.length).toBe(1)
    const serve = tools[0] as {
      name: string
      input_schema: { properties: Record<string, unknown>; required?: string[] }
    }
    expect(serve.name).toBe("serve")
    const propNames = Object.keys(serve.input_schema.properties)
    // All networkOptionDefs flags must appear in the catalog (superset check).
    for (const name of expectedNames) {
      expect(propNames).toContain(name)
    }
    // Required flags from networkOptionDefs (if any) must appear in `required`.
    const requiredExpected = networkOptionDefs
      .filter((o) => o.required === true)
      .map((o) => flagToName(o.flag))
    for (const name of requiredExpected) {
      expect(serve.input_schema.required ?? []).toContain(name)
    }
  })
})

describe("config: parseEnvExample", () => {
  test("treats `KEY=` as required and `# KEY=...` as optional", () => {
    const text = [
      "# comment-only line",
      "FOO=",
      "BAR=value",
      "# BAZ=hint",
      "  # QUX=",
      "",
    ].join("\n")
    const { required, optional } = parseEnvExample(text)
    expect(required).toEqual(["FOO", "BAR"])
    expect(optional).toEqual(["BAZ", "QUX"])
  })

  test("ignores plain comments and blank lines", () => {
    const text = ["# header", "", "# section", "ALPHA=1"].join("\n")
    const { required, optional } = parseEnvExample(text)
    expect(required).toEqual(["ALPHA"])
    expect(optional).toEqual([])
  })

  test("real .env.example yields the expected required keys", async () => {
    const text = await Bun.file(
      `${process.env.HOME ?? ""}/moonshort/assets-produce/.env.example`,
    ).text()
    const { required } = parseEnvExample(text)
    // AGENT_PORT and LANGFUSE_HOST/PROJECT have defaults but are still required
    // (per heuristic: line is not commented).
    expect(required).toContain("AGENT_PORT")
    expect(required).toContain("ANTHROPIC_API_KEY")
    expect(required).toContain("OSS_REGION")
    expect(required).toContain("JWT_SECRET")
    // AGENT_DB_PATH is commented out → optional.
    expect(required).not.toContain("AGENT_DB_PATH")
  })
})
