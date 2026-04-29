import { defineConfig } from "drizzle-kit"

// Tooling-time DB path. Runtime path lives in src/storage/db.ts (resolves
// AGENT_DB_PATH or falls back to <Global.Path.data>/agent.db). drizzle-kit
// runs outside the opencode runtime so it cannot import Global; use an env
// override for explicit targets, otherwise a CWD-relative dev DB.
const url = process.env.AGENT_DB_PATH ?? "./.agent/agent.db"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/**/*.sql.ts",
  out: "./migration",
  dbCredentials: {
    url,
  },
})
