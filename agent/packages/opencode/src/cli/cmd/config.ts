import type { Argv } from "yargs"
import * as fs from "fs/promises"
import * as path from "path"
import { Global } from "@opencode-ai/core/global"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { networkOptionDefs } from "../network"
import { GLOBAL_OPTIONS, type OptionDef, toJsonSchema, toYargsBuilder } from "../option-def"
import { getGlobalContext } from "../global-context"
import { warnDryRunIgnored } from "../output/dry-run-guard"
import { ExitCode } from "../errors/codes"

/**
 * Phase 6 Task 3 — `agent config` command group.
 *
 * Three sub-commands:
 *   - export-schema: emit Anthropic / OpenAI tool schemas describing how an
 *     external agent can invoke this CLI. Distinct from
 *     `agent tools export-schema` (Phase 3) which describes atomic LLM tools.
 *     See plan § 0.20.
 *   - show: print effective config (env + defaults), with secrets redacted.
 *   - validate: walk `.env.example` to determine required keys and verify each
 *     is set in `process.env`.
 *
 * The CLI tool descriptors below mirror the OptionDef[] declarations that
 * live next to each P1 command (`users.ts`, `tools.ts`, etc). Watch-out 1
 * forbids editing those files for this task, so the data is duplicated here
 * with the same shape. A drift-detection unit test in
 * `test/cli/cmd-config.test.ts` keeps the two in sync.
 */

function writeOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

/**
 * Pretty-print JSON to stdout with 2-space indent, matching the output style
 * used by `agent users add --dry-run` etc.
 */
function emitJson(value: unknown): void {
  writeOut(JSON.stringify(value, null, 2))
}

// ---------------------------------------------------------------------------
// CLI tool descriptors (mirrors of OptionDef arrays in P1 cmd files)
// ---------------------------------------------------------------------------

interface CliPositional {
  /** Property name (matches placeholder in command string, e.g. `<local>` → `local`). */
  name: string
  /** One-line description shown in schema output. */
  description: string
  /** Whether the positional is required. Default true. */
  required?: boolean
}

interface CliCommandDescriptor {
  /** Schema name in kebab-case, e.g. `users-add` or `oss-put`. */
  name: string
  /** Cmd `describe` field. */
  description: string
  /** OptionDef-style flag list (mirrored from the cmd file). */
  options: OptionDef[]
  /** Positional args, in order. */
  positionals?: CliPositional[]
}

// users
const usersAddOptions: OptionDef[] = [
  { flag: "--username", description: "username (3-32 chars, lowercase start)", required: true },
  {
    flag: "--role",
    description: "user role",
    required: true,
    extra: { choices: ["admin", "creator"] as const },
  },
  { flag: "--password", description: "initial password (≥8 chars); omit to disable login" },
  {
    flag: "--dry-run",
    description: "plan the user creation; do not write to the database",
    type: "boolean",
  },
]
const usersPasswdOptions: OptionDef[] = [
  { flag: "--username", description: "username whose password to update", required: true },
  { flag: "--password", description: "new password (≥8 chars)", required: true },
  {
    flag: "--dry-run",
    description: "plan the change; do not write the new password",
    type: "boolean",
  },
]
const usersDeleteOptions: OptionDef[] = [
  { flag: "--username", description: "username to delete", required: true },
]

// tools
const toolsListOptions: OptionDef[] = [
  { flag: "--verbose", description: "include description", type: "boolean" },
]
const toolsCallOptions: OptionDef[] = [
  { flag: "--json", description: "JSON params object as string" },
  { flag: "--params-file", description: "path to JSON file with params" },
  {
    flag: "--output",
    description: "raw=tool output text; url=output as a URL line; json=full result {output, metadata}",
    extra: { choices: ["raw", "url", "json"] as const, default: "raw" },
  },
]

// skills
const skillsAddOptions: OptionDef[] = [
  { flag: "--name", description: "skill name (snake_case)", required: true },
  { flag: "--description", description: "1-line description", required: true },
  { flag: "--content-file", description: "read body from local file" },
  { flag: "--content-url", description: "fetch body from https URL" },
  { flag: "--langfuse-prompt-key", description: "link to existing Langfuse prompt key" },
  { flag: "--label", description: "Langfuse label (default 'production')" },
  {
    flag: "--scope",
    description: "skill visibility: 'system' (CLI only) or 'creator' (WebUI)",
    extra: { choices: ["system", "creator"] as const },
  },
  {
    flag: "--enabled",
    description: "whether the skill is enabled at creation time",
    type: "boolean",
  },
  {
    flag: "--dry-run",
    description: "plan the skill add; do not write to DB or Langfuse",
    type: "boolean",
  },
]
const skillsUpdateOptions: OptionDef[] = [
  { flag: "--name", description: "skill name to update (snake_case)", required: true },
  { flag: "--description", description: "new 1-line description" },
  { flag: "--content-file", description: "replace body with contents of local file" },
  { flag: "--content-url", description: "replace body by fetching from https URL" },
  { flag: "--label", description: "new Langfuse label" },
  {
    flag: "--scope",
    description: "new scope: 'system' or 'creator'",
    extra: { choices: ["system", "creator"] as const },
  },
  { flag: "--enabled", description: "set enabled state", type: "boolean" },
  {
    flag: "--dry-run",
    description: "plan the update; do not write to DB or Langfuse",
    type: "boolean",
  },
]
const skillsDeleteOptions: OptionDef[] = [
  { flag: "--name", description: "skill name to delete (snake_case)", required: true },
]
const skillsListOptions: OptionDef[] = [
  {
    flag: "--scope",
    description: "filter by scope: 'system' or 'creator'",
    extra: { choices: ["system", "creator"] as const },
  },
  { flag: "--enabled-only", description: "only list enabled skills", type: "boolean" },
  {
    flag: "--output",
    description: "output format: 'text' (table) or 'json'",
    extra: { choices: ["text", "json"] as const, default: "text" },
  },
]
const skillsEnableOptions: OptionDef[] = [
  { flag: "--name", description: "skill name to enable (snake_case)", required: true },
]
const skillsDisableOptions: OptionDef[] = [
  { flag: "--name", description: "skill name to disable (snake_case)", required: true },
]
const skillsShowOptions: OptionDef[] = [
  {
    flag: "--output",
    description: "output format: 'text' (markdown) or 'json'",
    extra: { choices: ["text", "json"] as const, default: "text" },
  },
]

// oss
const ossPutOptions: OptionDef[] = [
  {
    flag: "--dry-run",
    description: "plan the upload; do not write to OSS",
    type: "boolean",
  },
]
const ossListOptions: OptionDef[] = [
  { flag: "--max-keys", description: "max keys to return", type: "number" },
]

// run (mirror of runOptions in run.ts)
const runOptions: OptionDef[] = [
  { flag: "--command", description: "the command to run, use message for args" },
  { flag: "--continue", description: "continue the last session", type: "boolean" },
  { flag: "--session", description: "session id to continue" },
  {
    flag: "--fork",
    description: "fork the session before continuing (requires --continue or --session)",
    type: "boolean",
  },
  { flag: "--share", description: "share the session", type: "boolean" },
  { flag: "--model", description: "model to use in the format of provider/model" },
  { flag: "--agent", description: "agent to use" },
  {
    flag: "--format",
    description: "format: default (formatted) or json (raw JSON events)",
    extra: { choices: ["default", "json"] as const },
  },
  { flag: "--file", description: "file(s) to attach to message", type: "array" },
  { flag: "--title", description: "title for the session (uses truncated prompt if no value provided)" },
  { flag: "--attach", description: "attach to a running opencode server (e.g., http://localhost:4096)" },
  { flag: "--password", description: "basic auth password (defaults to OPENCODE_SERVER_PASSWORD)" },
  { flag: "--dir", description: "directory to run in, path on remote server if attaching" },
  {
    flag: "--port",
    description: "port for the local server (defaults to random port if no value provided)",
    type: "number",
  },
  {
    flag: "--variant",
    description: "model variant (provider-specific reasoning effort, e.g., high, max, minimal)",
  },
  { flag: "--thinking", description: "show thinking blocks", type: "boolean" },
  {
    flag: "--dangerously-skip-permissions",
    description: "auto-approve permissions that are not explicitly denied (dangerous!)",
    type: "boolean",
  },
]

// serve options come from `networkOptionDefs` (canonical source in cli/network.ts).
// Imported above; no local mirror.

// models
const modelsOptions: OptionDef[] = [
  {
    flag: "--verbose",
    description: "use more verbose model output (includes metadata like costs)",
    type: "boolean",
  },
  { flag: "--refresh", description: "refresh the models cache from models.dev", type: "boolean" },
]

/**
 * Full descriptor catalog for migrated P1 commands. Order matches the spec
 * audit table in `docs/superpowers/specs/phase-6-cli-polish-plan.md` § 8.
 */
export const CLI_COMMAND_DESCRIPTORS: CliCommandDescriptor[] = [
  // users
  { name: "users-add", description: "create a user", options: usersAddOptions },
  { name: "users-list", description: "list all users", options: [] },
  { name: "users-passwd", description: "set or update a user's password", options: usersPasswdOptions },
  { name: "users-delete", description: "delete a user", options: usersDeleteOptions },
  // tools
  { name: "tools-list", description: "list all built-in tool ids (one per line)", options: toolsListOptions },
  {
    name: "tools-show",
    description: "show tool description + JSON schema",
    options: [],
    positionals: [{ name: "id", description: "tool id (e.g. generate-image)", required: true }],
  },
  {
    name: "tools-call",
    description: "invoke a single tool directly with JSON params (--json or --params-file)",
    options: toolsCallOptions,
    positionals: [{ name: "id", description: "tool id (e.g. generate-image-nanobanana)", required: true }],
  },
  {
    name: "tools-export-schema",
    description: "emit Anthropic-compatible tool JSON schemas (single id or all)",
    options: [],
    positionals: [{ name: "id", description: "optional tool id; omit to export all", required: false }],
  },
  // skills
  {
    name: "skills-add",
    description: "add a skill (from file / url / existing langfuse prompt)",
    options: skillsAddOptions,
  },
  { name: "skills-update", description: "update a skill's metadata or content", options: skillsUpdateOptions },
  {
    name: "skills-delete",
    description: "delete a skill (DB row only; Langfuse prompt is preserved)",
    options: skillsDeleteOptions,
  },
  { name: "skills-list", description: "list skills", options: skillsListOptions },
  { name: "skills-enable", description: "enable a skill", options: skillsEnableOptions },
  { name: "skills-disable", description: "disable a skill", options: skillsDisableOptions },
  {
    name: "skills-show",
    description: "show skill metadata + Langfuse body",
    options: skillsShowOptions,
    positionals: [{ name: "name", description: "skill name (snake_case)", required: true }],
  },
  {
    name: "skills-export-schema",
    description:
      "emit Anthropic-compatible tool schema for the skill loader (with available skills inlined in description)",
    options: [],
  },
  // oss
  {
    name: "oss-put",
    description: "upload a local file to OSS at <key>",
    options: ossPutOptions,
    positionals: [
      { name: "local", description: "path of local file", required: true },
      { name: "key", description: "OSS object key", required: true },
    ],
  },
  {
    name: "oss-get",
    description: "download OSS object <key> to local <local>",
    options: [],
    positionals: [
      { name: "key", description: "OSS object key", required: true },
      { name: "local", description: "local destination path", required: true },
    ],
  },
  {
    name: "oss-list",
    description: "list OSS keys, optionally filtered by prefix",
    options: ossListOptions,
    positionals: [{ name: "prefix", description: "optional key prefix", required: false }],
  },
  // run
  {
    name: "run",
    description: "run opencode with a message",
    options: runOptions,
    positionals: [{ name: "message", description: "message to send", required: false }],
  },
  // serve
  { name: "serve", description: "starts a headless opencode server", options: networkOptionDefs },
  // models
  {
    name: "models",
    description: "list all available models",
    options: modelsOptions,
    positionals: [{ name: "provider", description: "provider ID to filter models by", required: false }],
  },
]

// ---------------------------------------------------------------------------
// Schema builders
// ---------------------------------------------------------------------------

/**
 * Build a JSON-schema `properties` map for a CLI command — combining flag
 * options (via `toJsonSchema`) with positional args modelled as required (or
 * optional) string properties named after the placeholder.
 */
function inputSchemaFor(desc: CliCommandDescriptor): {
  type: "object"
  properties: Record<string, { type: string; description: string }>
  required: string[]
} {
  const properties: Record<string, { type: string; description: string }> = {}
  const required: string[] = []
  for (const pos of desc.positionals ?? []) {
    properties[pos.name] = { type: "string", description: pos.description }
    if (pos.required !== false) required.push(pos.name)
  }
  const flagSchema = toJsonSchema(desc.options)
  for (const [name, entry] of Object.entries(flagSchema)) {
    properties[name] = { type: entry.type, description: entry.description }
    if (entry.required) required.push(name)
  }
  return { type: "object", properties, required }
}

/** Anthropic tool schema shape: `{ name, description, input_schema }`. */
function toAnthropicTool(desc: CliCommandDescriptor) {
  return {
    name: desc.name,
    description: desc.description,
    input_schema: inputSchemaFor(desc),
  }
}

/** OpenAI tool schema shape: `{ type:"function", function:{ name, description, parameters } }`. */
function toOpenAiTool(desc: CliCommandDescriptor) {
  return {
    type: "function" as const,
    function: {
      name: desc.name,
      description: desc.description,
      parameters: inputSchemaFor(desc),
    },
  }
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

const exportSchemaOptions: OptionDef[] = [
  {
    flag: "--command",
    description: "filter to a single tool by kebab-cased name (e.g. users-add)",
  },
  {
    flag: "--format",
    description: "output format: anthropic (default) or openai",
    extra: { choices: ["anthropic", "openai"] as const, default: "anthropic" },
  },
]

interface ExportSchemaArgs {
  command?: string
  format: "anthropic" | "openai"
}

/**
 * Build the schema catalog emitted by `config export-schema`.
 * Exported for unit tests (drift detection between CLI options + schema output).
 */
export function getCatalog(opts?: {
  filter?: string
  format?: "anthropic" | "openai"
}): {
  tools: Array<ReturnType<typeof toAnthropicTool> | ReturnType<typeof toOpenAiTool>>
  global_flags: ReturnType<typeof toJsonSchema>
} {
  const filter = opts?.filter
  const descriptors = filter
    ? CLI_COMMAND_DESCRIPTORS.filter((d) => d.name === filter)
    : CLI_COMMAND_DESCRIPTORS
  const format = opts?.format === "openai" ? "openai" : "anthropic"
  const tools = descriptors.map((d) => (format === "openai" ? toOpenAiTool(d) : toAnthropicTool(d)))
  return { tools, global_flags: toJsonSchema(GLOBAL_OPTIONS) }
}

export const ConfigExportSchemaCommand = cmd({
  command: "export-schema",
  describe: "emit JSON schema describing how to invoke each agent CLI command",
  builder: (yargs: Argv) => toYargsBuilder<unknown, ExportSchemaArgs>(yargs, exportSchemaOptions),
  async handler(args) {
    if (getGlobalContext().dryRun) warnDryRunIgnored("config export-schema")
    const filter = typeof args.command === "string" ? args.command : undefined
    const format = args.format === "openai" ? "openai" : "anthropic"
    emitJson(getCatalog({ filter, format }))
  },
})

// --- show -----------------------------------------------------------------

/**
 * Keys reported by `config show`. Mirrors `.env.example`. Anything matching
 * `*_KEY`, `*_SECRET`, or named `JWT_SECRET` / `password` is redacted.
 */
const KNOWN_ENV_KEYS = [
  "AGENT_PORT",
  "AGENT_DB_PATH",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "LANGFUSE_HOST",
  "LANGFUSE_PROJECT",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "OSS_REGION",
  "OSS_ACCESS_KEY_ID",
  "OSS_ACCESS_KEY_SECRET",
  "OSS_BUCKET",
  "OSS_ENDPOINT",
  "FC_GENERATE_IMAGE_NANOBANANA_URL",
  "FC_GENERATE_IMAGE_NANOBANANA_TOKEN",
  "FC_GENERATE_IMAGE_GPT_URL",
  "FC_GENERATE_IMAGE_GPT_TOKEN",
  "FC_GENERATE_VIDEO_SEEDANCE_URL",
  "FC_GENERATE_VIDEO_SEEDANCE_TOKEN",
  "FC_GENERATE_VIDEO_HAPPYHORSE_URL",
  "FC_GENERATE_VIDEO_HAPPYHORSE_TOKEN",
  "FC_CONCAT_CLIPS_URL",
  "FC_CONCAT_CLIPS_TOKEN",
  "FC_CROP_VIDEO_URL",
  "FC_CROP_VIDEO_TOKEN",
  "OPENCODE_PURE",
  "OPENCODE_SERVER_PASSWORD",
  "JWT_SECRET",
  "NEXT_PUBLIC_AGENT_HTTP_BASE_URL",
  "NEXT_PUBLIC_LANGFUSE_HOST",
] as const

/**
 * Returns true when the env var name should be redacted (i.e. its value is
 * sensitive and should never be printed by `config show`).
 */
function isSecretKey(name: string): boolean {
  if (/_KEY$/i.test(name)) return true
  if (/_SECRET$/i.test(name)) return true
  if (/_TOKEN$/i.test(name)) return true
  if (/^JWT_SECRET$/i.test(name)) return true
  if (/^OPENCODE_SERVER_PASSWORD$/i.test(name)) return true
  if (/password/i.test(name)) return true
  return false
}

function envSnapshot(fileEnv: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of KNOWN_ENV_KEYS) {
    const raw = process.env[name] ?? fileEnv[name] ?? ""
    if (isSecretKey(name)) {
      out[name] = raw.length > 0 ? "(set)" : "(unset)"
      continue
    }
    out[name] = raw.length > 0 ? raw : "(unset)"
  }
  return out
}

function defaultsSnapshot(): Record<string, string | number> {
  const port = Number(process.env.AGENT_PORT ?? 8001) || 8001
  const dbPath = process.env.AGENT_DB_PATH ?? path.join(Global.Path.data, "agent.db")
  return {
    agent_port: port,
    db_path: dbPath,
  }
}

/**
 * Source `.env` values that Bun's auto-loader did not pick up because the cwd
 * at process start is below the project root. Mirrors the same fallback used
 * by `config validate`.
 */
async function loadProjectDotenv(): Promise<Record<string, string>> {
  const envExamplePath = await findEnvExample(process.cwd())
  if (!envExamplePath) return {}
  const candidate = path.join(path.dirname(envExamplePath), ".env")
  try {
    const buf = await fs.readFile(candidate, "utf8")
    return parseDotenv(buf)
  } catch {
    return {}
  }
}

export const ConfigShowCommand = cmd({
  command: "show",
  describe: "print effective config (env + defaults), with secrets redacted",
  builder: (yargs: Argv) => yargs,
  async handler() {
    if (getGlobalContext().dryRun) warnDryRunIgnored("config show")
    const fileEnv = await loadProjectDotenv()
    emitJson({ env: envSnapshot(fileEnv), defaults: defaultsSnapshot() })
  },
})

// --- validate -------------------------------------------------------------

/**
 * Walk up from the current working directory looking for a `.env.example`
 * file. Returns the absolute path of the first one found, or `undefined` when
 * the filesystem root is reached without a hit.
 *
 * Searching upward (rather than hardcoding the repo root) lets the validate
 * command work whether invoked from the repo root or from inside
 * `agent/packages/opencode` — the verification protocol uses the latter.
 */
async function findEnvExample(start: string): Promise<string | undefined> {
  let dir = path.resolve(start)
  for (let i = 0; i < 16; i++) {
    const candidate = path.join(dir, ".env.example")
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) return candidate
    } catch {
      // not present here; keep climbing
    }
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}

/**
 * Parse `.env.example` lines into required / optional key sets.
 *
 *   `KEY=`             → required (intentionally blank, awaiting value)
 *   `KEY=value`        → required (has a default value)
 *   `# KEY=...`        → optional (commented out)
 *
 * Lines that are pure comments or blanks are ignored. Values are not
 * inspected — only key presence + comment state.
 */
export function parseEnvExample(text: string): { required: string[]; optional: string[] } {
  const required: string[] = []
  const optional: string[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue
    const isComment = line.startsWith("#")
    const body = isComment ? line.replace(/^#\s*/, "") : line
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(body)
    if (!m) continue
    const key = m[1] as string
    if (isComment) {
      optional.push(key)
    } else {
      required.push(key)
    }
  }
  return { required, optional }
}

/**
 * Read a `.env` file (or any KEY=VALUE list) into a flat record. Comments
 * (`#`-prefixed) and blank lines are skipped. Quotes around values are
 * stripped. Used by `config validate` to look up env values that Bun's auto-
 * loader did not pick up because the cwd at process start was a sub-directory
 * of the project root.
 */
function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue
    let value = line.slice(eq + 1).trim()
    // strip surrounding quotes if any
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export const ConfigValidateCommand = cmd({
  command: "validate",
  describe: "verify all required env vars (per .env.example) are set in the current process",
  builder: (yargs: Argv) => yargs,
  async handler() {
    if (getGlobalContext().dryRun) warnDryRunIgnored("config validate")
    const envExamplePath = await findEnvExample(process.cwd())
    if (!envExamplePath) {
      UI.error(`could not find .env.example by walking up from ${process.cwd()}`)
      emitJson({ ok: false, missing: [], error: "env-example-not-found" })
      process.exit(ExitCode.AUTH)
    }
    let text: string
    try {
      text = await fs.readFile(envExamplePath, "utf8")
    } catch (e) {
      UI.error(`failed to read ${envExamplePath}: ${e instanceof Error ? e.message : String(e)}`)
      emitJson({ ok: false, missing: [], error: "env-example-unreadable" })
      process.exit(ExitCode.AUTH)
    }
    const { required } = parseEnvExample(text)
    // Bun auto-loads `.env` from cwd at process start. When the CLI is
    // invoked from a sub-directory (e.g. `packages/opencode/src/index.ts`),
    // the project-root `.env` is missed. Compensate by sourcing values from
    // the `.env` file co-located with the resolved `.env.example` (if any).
    const envFromFile: Record<string, string> = await (async () => {
      const candidate = path.join(path.dirname(envExamplePath), ".env")
      try {
        const buf = await fs.readFile(candidate, "utf8")
        return parseDotenv(buf)
      } catch {
        return {}
      }
    })()
    const has = (k: string): boolean => {
      const fromProcess = process.env[k]
      if (typeof fromProcess === "string" && fromProcess.length > 0) return true
      const fromFile = envFromFile[k]
      return typeof fromFile === "string" && fromFile.length > 0
    }
    const missing = required.filter((k) => !has(k))
    if (missing.length === 0) {
      emitJson({ ok: true, missing: [] })
      return
    }
    emitJson({ ok: false, missing })
    process.exit(ExitCode.AUTH)
  },
})

// --- top-level group ------------------------------------------------------

export const ConfigCommand = cmd({
  command: "config <command>",
  describe: "inspect agent CLI configuration (export-schema / show / validate)",
  builder: (yargs: Argv) =>
    yargs
      .command(ConfigExportSchemaCommand)
      .command(ConfigShowCommand)
      .command(ConfigValidateCommand)
      .demandCommand(),
  async handler() {},
})
