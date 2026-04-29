import type { Ruleset } from "./index"

// Profile decides what the chat session's LLM is allowed to call. Web users
// run as "creator"; CLI / external agents run as "developer".
export type Profile = "creator" | "developer"

// creator: cannot edit code, cannot manage skills/config/shell, but can
// invoke atomic asset tools, the skill loader, read-only tools, and
// chat-helpers (todowrite / glob / grep / webfetch).
export const creatorRuleset: Ruleset = [
  { permission: "tool:bash", pattern: "*", action: "deny" },
  { permission: "tool:edit", pattern: "*", action: "deny" },
  { permission: "tool:write", pattern: "*", action: "deny" },
  { permission: "tool:apply_patch", pattern: "*", action: "deny" },
  { permission: "tool:lsp_*", pattern: "*", action: "deny" },
  { permission: "tool:ast_grep_*", pattern: "*", action: "deny" },
  { permission: "tool:debug", pattern: "*", action: "deny" },
  { permission: "skills:add", pattern: "*", action: "deny" },
  { permission: "skills:update", pattern: "*", action: "deny" },
  { permission: "skills:delete", pattern: "*", action: "deny" },
  { permission: "config:*", pattern: "*", action: "deny" },
  { permission: "shell:*", pattern: "*", action: "deny" },
  // catch-all allow ensures Permission.evaluate doesn't fall through to
  // "ask" for anything unmentioned (chat / skill-load / generate-* /
  // read / glob / grep / todowrite / webfetch / asset queries).
  { permission: "*", pattern: "*", action: "allow" },
]

// developer: trusted CLI users. Allow everything; specific deny rules
// can still be added via per-project config.
export const developerRuleset: Ruleset = [
  { permission: "*", pattern: "*", action: "allow" },
]

export function applyProfile(profile: Profile): Ruleset {
  return profile === "developer" ? developerRuleset : creatorRuleset
}
