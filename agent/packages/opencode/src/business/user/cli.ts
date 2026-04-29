import { Effect } from "effect"
import { z } from "zod"
import { NamedError } from "@opencode-ai/core/util/error"
import { Service as User, type Role } from "./user"
import { hashPassword } from "@/auth/web"
import type { UserRow } from "./user.sql"

export const UserCliError = NamedError.create(
  "UserCliError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type UserCliError = InstanceType<typeof UserCliError>

const USERNAME_PATTERN = /^[a-z][a-z0-9_-]{2,31}$/

function validateUsername(username: string): Effect.Effect<void, UserCliError> {
  if (!USERNAME_PATTERN.test(username))
    return Effect.fail(
      new UserCliError({
        op: "validate",
        message: `username must match ${USERNAME_PATTERN.source} (3-32 chars, lowercase start, alnum/_/-)`,
      }),
    )
  return Effect.void
}

function validatePassword(password: string): Effect.Effect<void, UserCliError> {
  if (password.length < 8)
    return Effect.fail(
      new UserCliError({ op: "validate", message: "password must be ≥ 8 chars" }),
    )
  return Effect.void
}

function validateRole(role: string): Effect.Effect<void, UserCliError> {
  if (role !== "admin" && role !== "creator")
    return Effect.fail(
      new UserCliError({ op: "validate", message: `role must be "admin" or "creator" (got: ${role})` }),
    )
  return Effect.void
}

export interface AddOpts {
  username: string
  role: "admin" | "creator"
  password?: string
  dryRun?: boolean
}

export interface PasswdOpts {
  username: string
  password: string
  dryRun?: boolean
}

export interface AddResult {
  resolved: { id?: string; username: string; role: string; hasPassword: boolean }
  dryRun: boolean
}

export const addUser = (opts: AddOpts) =>
  Effect.gen(function* () {
    yield* validateUsername(opts.username)
    yield* validateRole(opts.role)
    if (opts.password !== undefined) yield* validatePassword(opts.password)

    const hasPassword = opts.password !== undefined

    const result: AddResult = {
      resolved: { username: opts.username, role: opts.role, hasPassword },
      dryRun: Boolean(opts.dryRun),
    }

    if (opts.dryRun) return result

    const userSvc = yield* User
    const existing = yield* userSvc.getByUsername(opts.username)
    if (existing)
      return yield* Effect.fail(
        new UserCliError({
          op: "duplicate",
          message: `user "${opts.username}" already exists`,
        }),
      )

    const passwordHash = opts.password
      ? yield* Effect.tryPromise({
          try: () => hashPassword(opts.password!),
          catch: (e) => new UserCliError({ op: "hash", message: e instanceof Error ? e.message : String(e) }),
        })
      : undefined

    const row = yield* userSvc.create({
      username: opts.username,
      role: opts.role as Role,
      passwordHash: passwordHash ?? null,
    })

    result.resolved.id = row.id
    return result
  })

export const setPassword = (opts: PasswdOpts) =>
  Effect.gen(function* () {
    yield* validateUsername(opts.username)
    yield* validatePassword(opts.password)

    const userSvc = yield* User
    const existing = yield* userSvc.getByUsername(opts.username)
    if (!existing)
      return yield* Effect.fail(
        new UserCliError({ op: "not_found", message: `user "${opts.username}" not found` }),
      )

    if (opts.dryRun) return { id: existing.id, username: existing.username }

    const passwordHash = yield* Effect.tryPromise({
      try: () => hashPassword(opts.password),
      catch: (e) => new UserCliError({ op: "hash", message: e instanceof Error ? e.message : String(e) }),
    })

    yield* userSvc.update(existing.id, { passwordHash })
    return { id: existing.id, username: existing.username }
  })

export const listUsers = () =>
  Effect.gen(function* () {
    const userSvc = yield* User
    return yield* userSvc.list()
  })

export const deleteUser = (username: string) =>
  Effect.gen(function* () {
    yield* validateUsername(username)
    const userSvc = yield* User
    const existing = yield* userSvc.getByUsername(username)
    if (!existing)
      return yield* Effect.fail(
        new UserCliError({ op: "not_found", message: `user "${username}" not found` }),
      )
    yield* userSvc.delete(existing.id)
  })

export * as UserCli from "./cli"
