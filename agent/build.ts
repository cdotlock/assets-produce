// Phase 6 Task 7 — Bun bundle entry. See docs/superpowers/specs/phase-6-cli-polish-plan.md § 0.14-0.16.
//
// We externalize every package listed in dependencies/devDependencies so the
// Bun runtime resolves them at startup. This is the conservative default per
// the task spec — it trades binary size for startup speed and avoids native-
// binding pitfalls (better-sqlite3 / bun:sqlite, ali-oss, parcel-watcher etc.).
// Only first-party `src/**` code lands in the bundle.
//
// The bundle is emitted into `packages/opencode/dist/` so Bun's module
// resolution walks straight into `packages/opencode/node_modules/` for the
// externals at startup. A tiny re-export shim at `agent/dist/agent.mjs`
// preserves the canonical path (`bun agent/dist/agent.mjs`).

import { readFileSync, mkdirSync, statSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { resolve, dirname, relative, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const opencodeDir = resolve(here, "packages/opencode")
const opencodePkgPath = resolve(opencodeDir, "package.json")
const opencodePkg = JSON.parse(readFileSync(opencodePkgPath, "utf-8"))

// db.ts reads migrations via filesystem at startup using a path relative to
// `import.meta.dirname`. That breaks once the bundle is moved out of the
// source tree. db.ts has an `OPENCODE_MIGRATIONS` global escape hatch — we
// inject the migrations inline at build time.
function loadMigrations(): { sql: string; timestamp: number; name: string }[] {
  const dir = resolve(opencodeDir, "migration")
  if (!existsSync(dir)) return []
  const time = (tag: string): number => {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
    if (!m) return 0
    return Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    )
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const file = join(dir, e.name, "migration.sql")
      if (!existsSync(file)) return null
      return {
        sql: readFileSync(file, "utf-8"),
        timestamp: time(e.name),
        name: e.name,
      }
    })
    .filter((m): m is { sql: string; timestamp: number; name: string } => m !== null)
    .sort((a, b) => a.timestamp - b.timestamp)
}

const migrations = loadMigrations()

// Combine deps + devDeps. yargs / langfuse / @ai-sdk/* etc. all resolved at
// runtime by Bun. workspace:* deps (e.g. @opencode-ai/core) are linked via
// node_modules so they resolve too.
//
// `drizzle-orm` MUST be bundled — `src/storage/db.ts` does
// `export * from "drizzle-orm"` and Bun's bundler emits a `__reExport(...)`
// call that references the module identifier as a top-level binding. When the
// module is external, no such binding exists and the bundle crashes at startup
// with "drizzle_orm is not defined". Bundling it is fine — drizzle-orm is
// pure JS (~200KB).
const externalSet = new Set<string>([
  ...Object.keys(opencodePkg.dependencies ?? {}),
  ...Object.keys(opencodePkg.devDependencies ?? {}),
  // Bun built-ins that should never be bundled.
  "bun:sqlite",
  "bun:test",
  "bun:ffi",
])
externalSet.delete("drizzle-orm")
externalSet.delete("drizzle-kit")
const external = [...externalSet].sort()

const innerOutDir = resolve(opencodeDir, "dist")
const outerOutDir = resolve(here, "dist")
mkdirSync(innerOutDir, { recursive: true })
mkdirSync(outerOutDir, { recursive: true })

const result = await Bun.build({
  entrypoints: [resolve(opencodeDir, "src/index.ts")],
  outdir: innerOutDir,
  target: "bun",
  format: "esm",
  naming: "agent.mjs",
  external,
  define: {
    OPENCODE_MIGRATIONS: JSON.stringify(migrations),
  },
  // Avoid minify by default — see plan § 0.16 watch-out re cold start.
  minify: false,
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

const innerOut = resolve(innerOutDir, "agent.mjs")
const outerOut = resolve(outerOutDir, "agent.mjs")

// Thin re-export shim at agent/dist/agent.mjs. Static import (not dynamic)
// so the import is hoisted before any side effect — keeps the entry path
// canonical for `bun agent/dist/agent.mjs <cmd>` while letting the actual
// bundle resolve modules from packages/opencode/node_modules/.
const relInner = relative(outerOutDir, innerOut)
writeFileSync(
  outerOut,
  `// Phase 6 Task 7 — re-export shim. Real bundle lives next to opencode\n` +
    `// node_modules so Bun resolves externals at startup.\n` +
    `import ${JSON.stringify(relInner)}\n`,
)

const size = statSync(innerOut).size
const mb = (size / 1024 / 1024).toFixed(2)
console.log(`build ok: ${innerOut} (${mb} MB, ${external.length} externals, ${migrations.length} migrations inlined)`)
console.log(`shim:     ${outerOut} -> ${relInner}`)
