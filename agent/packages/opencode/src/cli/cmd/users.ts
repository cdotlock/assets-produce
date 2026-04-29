import type { Argv } from "yargs"
import { Cause, Effect, Exit } from "effect"
import { Instance } from "../../project/instance"
import { AppRuntime } from "@/effect/app-runtime"
import { UserCli } from "@/business/user/cli"
import { Service as User } from "@/business/user/user"
import { defaultLayer as userDefaultLayer } from "@/business/user/user"
import { cmd } from "./cmd"
import { UI } from "../ui"

function writeOut(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

function provideUserLayer<A, E>(eff: Effect.Effect<A, E, User>): Effect.Effect<A, E> {
  return eff.pipe(Effect.provide(userDefaultLayer)) as Effect.Effect<A, E>
}

async function runWithLayers<A, E>(eff: Effect.Effect<A, E, User>): Promise<Exit.Exit<A, E>> {
  let result!: Exit.Exit<A, E>
  await Instance.provide({
    directory: process.cwd(),
    async fn() {
      result = (await AppRuntime.runPromiseExit(provideUserLayer(eff) as Effect.Effect<A, E>)) as Exit.Exit<A, E>
    },
  })
  return result
}

function formatErrorFromCause<E>(cause: Cause.Cause<E>): string {
  let e: unknown = undefined
  for (const reason of cause.reasons) {
    if (reason._tag === "Fail") {
      e = reason.error
      break
    }
    if (reason._tag === "Die") {
      e = reason.defect
      break
    }
  }
  if (e && typeof e === "object" && "data" in e) {
    const data = (e as { data?: { op?: unknown; message?: unknown } }).data
    if (data && typeof data === "object") {
      const { op, message } = data as { op?: unknown; message?: unknown }
      const opStr = typeof op === "string" ? op : "error"
      const msgStr = typeof message === "string" ? message : JSON.stringify(data)
      return `[${opStr}] ${msgStr}`
    }
  }
  if (e instanceof Error) return e.name === e.message ? e.name : e.message
  if (e !== undefined) return String(e)
  return Cause.pretty(cause).split("\n")[0] ?? "unexpected error"
}

export const UsersCommand = cmd({
  command: "users <command>",
  describe: "manage creator users (add/list/passwd/delete)",
  builder: (yargs: Argv) =>
    yargs
      .command(UsersAddCommand)
      .command(UsersListCommand)
      .command(UsersPasswdCommand)
      .command(UsersDeleteCommand)
      .demandCommand(),
  async handler() {},
})

export const UsersAddCommand = cmd({
  command: "add",
  describe: "create a user",
  builder: (yargs: Argv) =>
    yargs
      .option("username", { type: "string", demandOption: true, describe: "username (3-32 chars, lowercase start)" })
      .option("role", {
        type: "string",
        choices: ["admin", "creator"] as const,
        demandOption: true,
        describe: "user role",
      })
      .option("password", { type: "string", describe: "initial password (≥8 chars); omit to disable login" })
      .option("dry-run", { type: "boolean", default: false }),
  async handler(args) {
    const exit = await runWithLayers(
      UserCli.addUser({
        username: String(args.username),
        role: String(args.role) as "admin" | "creator",
        password: typeof args.password === "string" ? args.password : undefined,
        dryRun: Boolean(args["dry-run"]),
      }),
    )
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    const { resolved, dryRun } = exit.value
    if (dryRun) {
      writeOut(JSON.stringify({ resolved, dryRun }, null, 2))
      return
    }
    writeOut(
      `created user ${resolved.id} username=${resolved.username} role=${resolved.role} password=${resolved.hasPassword ? "set" : "(none)"}`,
    )
  },
})

export const UsersListCommand = cmd({
  command: "list",
  describe: "list all users",
  builder: (yargs: Argv) => yargs,
  async handler() {
    const exit = await runWithLayers(UserCli.listUsers())
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    const rows = exit.value
    const ID_W = 28
    const USER_W = 20
    const ROLE_W = 8
    const PASS_W = 12
    const header = [
      "ID".padEnd(ID_W),
      "username".padEnd(USER_W),
      "role".padEnd(ROLE_W),
      "has_password".padEnd(PASS_W),
      "time_created",
    ].join(" | ")
    writeOut(header)
    writeOut("-".repeat(header.length))
    for (const r of rows) {
      writeOut(
        [
          r.id.padEnd(ID_W),
          r.username.padEnd(USER_W),
          r.role.padEnd(ROLE_W),
          (r.password_hash ? "true" : "false").padEnd(PASS_W),
          new Date(r.time_created).toISOString(),
        ].join(" | "),
      )
    }
  },
})

export const UsersPasswdCommand = cmd({
  command: "passwd",
  describe: "set or update a user's password",
  builder: (yargs: Argv) =>
    yargs
      .option("username", { type: "string", demandOption: true })
      .option("password", { type: "string", demandOption: true, describe: "new password (≥8 chars)" })
      .option("dry-run", { type: "boolean", default: false }),
  async handler(args) {
    const exit = await runWithLayers(
      UserCli.setPassword({
        username: String(args.username),
        password: String(args.password),
        dryRun: Boolean(args["dry-run"]),
      }),
    )
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    const { id, username } = exit.value
    writeOut(`password updated for ${username} (id=${id})`)
  },
})

export const UsersDeleteCommand = cmd({
  command: "delete",
  describe: "delete a user",
  builder: (yargs: Argv) => yargs.option("username", { type: "string", demandOption: true }),
  async handler(args) {
    const exit = await runWithLayers(UserCli.deleteUser(String(args.username)))
    if (Exit.isFailure(exit)) {
      UI.error(formatErrorFromCause(exit.cause))
      process.exitCode = 1
      return
    }
    writeOut(`deleted user ${String(args.username)}`)
  },
})
