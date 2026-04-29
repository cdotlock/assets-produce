#!/usr/bin/env bun
// Smoke-test Langfuse SDK connectivity. Phase 2 verification item #4.
//
// Usage:
//   LANGFUSE_HOST=... LANGFUSE_PUBLIC_KEY=... LANGFUSE_SECRET_KEY=... \
//   bun run script/langfuse-smoke.ts <prompt-name> [--label <label>]
//
// Prereq: in Langfuse project `assets-produce`, manually create a prompt
// (e.g., `test_phase2_smoke`) before running this script.

import { Effect } from "effect"
import * as Langfuse from "@/langfuse/langfuse"

const args = process.argv.slice(2)
const name = args[0]
if (!name) {
  console.error("usage: bun run script/langfuse-smoke.ts <prompt-name> [--label <label>]")
  process.exit(2)
}
const labelIdx = args.indexOf("--label")
const label = labelIdx >= 0 ? args[labelIdx + 1] : undefined

const program = Effect.gen(function* () {
  const svc = yield* Langfuse.Service
  const prompt = yield* svc.getPrompt(name, label ? { label } : undefined)
  console.log(JSON.stringify({ name: prompt.name, version: prompt.version, label: prompt.label, type: prompt.type, body: prompt.body }, null, 2))
})

await Effect.runPromise(program.pipe(Effect.provide(Langfuse.defaultLayer)))
