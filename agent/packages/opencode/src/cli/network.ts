import type { Argv, InferredOptionTypes } from "yargs"
import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { type OptionDef, toYargsBuilder } from "./option-def"

/**
 * Shared network options for `serve` (P1) and `web` (P2). Sourced from a
 * single OptionDef[] so Phase 6 schema export tooling stays in sync with the
 * yargs builder; the legacy `options` object below is kept (derived from the
 * same defs) so `NetworkOptions` retains its precise type via
 * `InferredOptionTypes`.
 */
export const networkOptionDefs: OptionDef[] = [
  {
    flag: "--port",
    description: "port to listen on",
    type: "number",
    extra: { default: 0 },
  },
  {
    flag: "--hostname",
    description: "hostname to listen on",
    extra: { default: "127.0.0.1" },
  },
  {
    flag: "--mdns",
    description: "enable mDNS service discovery (defaults hostname to 0.0.0.0)",
    type: "boolean",
    extra: { default: false },
  },
  {
    flag: "--mdns-domain",
    description: "custom domain name for mDNS service (default: opencode.local)",
    extra: { default: "opencode.local" },
  },
  {
    flag: "--cors",
    description: "additional domains to allow for CORS",
    type: "array",
    extra: { default: [] as string[] },
  },
]

const options = {
  port: {
    type: "number" as const,
    describe: "port to listen on",
    default: 0,
  },
  hostname: {
    type: "string" as const,
    describe: "hostname to listen on",
    default: "127.0.0.1",
  },
  mdns: {
    type: "boolean" as const,
    describe: "enable mDNS service discovery (defaults hostname to 0.0.0.0)",
    default: false,
  },
  "mdns-domain": {
    type: "string" as const,
    describe: "custom domain name for mDNS service (default: opencode.local)",
    default: "opencode.local",
  },
  cors: {
    type: "string" as const,
    array: true,
    describe: "additional domains to allow for CORS",
    default: [] as string[],
  },
}

export type NetworkOptions = InferredOptionTypes<typeof options>

export function withNetworkOptions<T>(yargs: Argv<T>): Argv<T & NetworkOptions> {
  return toYargsBuilder<T, NetworkOptions>(yargs, networkOptionDefs)
}
export async function resolveNetworkOptions(args: NetworkOptions) {
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  return resolveNetworkOptionsNoConfig(args, config)
}

export function resolveNetworkOptionsNoConfig(args: NetworkOptions, config?: Config.Info) {
  const portExplicitlySet = process.argv.includes("--port")
  const hostnameExplicitlySet = process.argv.includes("--hostname")
  const mdnsExplicitlySet = process.argv.includes("--mdns")
  const mdnsDomainExplicitlySet = process.argv.includes("--mdns-domain")
  const mdns = mdnsExplicitlySet ? args.mdns : (config?.server?.mdns ?? args.mdns)
  const mdnsDomain = mdnsDomainExplicitlySet ? args["mdns-domain"] : (config?.server?.mdnsDomain ?? args["mdns-domain"])
  const port = portExplicitlySet ? args.port : (config?.server?.port ?? args.port)
  const hostname = hostnameExplicitlySet
    ? args.hostname
    : mdns && !config?.server?.hostname
      ? "0.0.0.0"
      : (config?.server?.hostname ?? args.hostname)
  const configCors = config?.server?.cors ?? []
  const argsCors = Array.isArray(args.cors) ? args.cors : args.cors ? [args.cors] : []
  const cors = [...configCors, ...argsCors]

  return { hostname, port, mdns, mdnsDomain, cors }
}
