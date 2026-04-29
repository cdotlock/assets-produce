import { cmd } from "./cmd"
import { Effect } from "effect"
import * as fs from "fs/promises"
import * as path from "path"
import * as OSSService from "@/oss/oss"
import { UI } from "../ui"

function runWithOSS<A>(eff: Effect.Effect<A, unknown, OSSService.Service>): Promise<A> {
  return Effect.runPromise(eff.pipe(Effect.provide(OSSService.defaultLayer)) as Effect.Effect<A, unknown, never>)
}

export const OssCommand = cmd({
  command: "oss <command>",
  describe: "manage Aliyun OSS objects (put / get / list)",
  builder: (yargs) =>
    yargs.command(OssPutCommand).command(OssGetCommand).command(OssListCommand).demandCommand(),
  async handler() {},
})

export const OssPutCommand = cmd({
  command: "put <local> <key>",
  describe: "upload a local file to OSS at <key>",
  builder: (yargs) =>
    yargs
      .positional("local", { type: "string", describe: "path of local file", demandOption: true })
      .positional("key", { type: "string", describe: "OSS object key", demandOption: true }),
  async handler(args) {
    const localPath = path.resolve(String(args.local))
    const key = String(args.key)
    const buf = await fs.readFile(localPath)
    const result = await runWithOSS(
      Effect.gen(function* () {
        const svc = yield* OSSService.Service
        return yield* svc.put(key, buf)
      }),
    )
    UI.println(`uploaded ${localPath} -> ${result.url}`)
  },
})

export const OssGetCommand = cmd({
  command: "get <key> <local>",
  describe: "download OSS object <key> to local <local>",
  builder: (yargs) =>
    yargs
      .positional("key", { type: "string", describe: "OSS object key", demandOption: true })
      .positional("local", { type: "string", describe: "local destination path", demandOption: true }),
  async handler(args) {
    const key = String(args.key)
    const localPath = path.resolve(String(args.local))
    const buf = await runWithOSS(
      Effect.gen(function* () {
        const svc = yield* OSSService.Service
        return yield* svc.get(key)
      }),
    )
    await fs.mkdir(path.dirname(localPath), { recursive: true })
    await fs.writeFile(localPath, buf)
    UI.println(`downloaded ${key} -> ${localPath} (${buf.length} bytes)`)
  },
})

export const OssListCommand = cmd({
  command: "list [prefix]",
  describe: "list OSS keys, optionally filtered by prefix",
  aliases: ["ls"],
  builder: (yargs) =>
    yargs
      .positional("prefix", { type: "string", describe: "optional key prefix" })
      .option("max-keys", { type: "number", default: 100, describe: "max keys to return" }),
  async handler(args) {
    const prefix = args.prefix ? String(args.prefix) : undefined
    const maxKeys = Number(args["max-keys"] ?? 100)
    const result = await runWithOSS(
      Effect.gen(function* () {
        const svc = yield* OSSService.Service
        return yield* svc.list({ prefix, maxKeys })
      }),
    )
    if (result.keys.length === 0) {
      UI.println(prefix ? `no keys with prefix "${prefix}"` : "no keys")
      return
    }
    for (const key of result.keys) UI.println(key)
    if (result.nextMarker) UI.println(`-- truncated; next marker: ${result.nextMarker}`)
  },
})
