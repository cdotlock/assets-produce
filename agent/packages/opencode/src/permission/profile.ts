import type { Ruleset } from "./index"

// Profile decides what the chat session's LLM is allowed to call. Web users
// run as "creator"; CLI / external agents run as "developer".
export type Profile = "creator" | "developer"

// creator: cannot edit code, cannot run shell, no debug. Can invoke atomic
// asset tools, the skill loader, read-only tools, chat helpers.
//
// Rule ordering: Permission.evaluate / Permission.disabled both use
// findLast (last-match-wins). The catch-all `allow * *` must come FIRST
// so the specific deny rules below it override it.
//
// Permission keys are bare tool/op names (e.g. `bash`, `edit`) — NOT
// prefixed with `tool:`. Runtime call sites (tool/bash.ts, llm.ts via
// Permission.disabled, skill.ts) pass bare names; a `tool:` prefix would
// never match and the rule would be dead.
export const creatorRuleset: Ruleset = [
  { permission: "*", pattern: "*", action: "allow" },
  { permission: "bash", pattern: "*", action: "deny" },
  { permission: "edit", pattern: "*", action: "deny" },
  { permission: "write", pattern: "*", action: "deny" },
  { permission: "apply_patch", pattern: "*", action: "deny" },
  { permission: "lsp_*", pattern: "*", action: "deny" },
  { permission: "ast_grep_*", pattern: "*", action: "deny" },
  { permission: "debug", pattern: "*", action: "deny" },
]

// developer: trusted CLI users. Allow everything; specific deny rules can
// still be added via per-project config.
export const developerRuleset: Ruleset = [
  { permission: "*", pattern: "*", action: "allow" },
]

export function applyProfile(profile: Profile): Ruleset {
  return profile === "developer" ? developerRuleset : creatorRuleset
}
