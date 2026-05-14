// Production wiring for the Phase 8 Asset Service:
//  - defaultAssetWriter goes through Asset.Service so we inherit its
//    transactional version-bump (one Asset row per (project_id, key, version))
//    instead of reimplementing it.
//  - placeholderGenerator returns a deterministic stub URL so `agent serve`
//    smoke-tests work end-to-end without a real LLM. Phase 9+ replaces it
//    with an LLM-driven implementation that consumes the picked skill body
//    and atomic tools.
//  - assetServiceSingleton lazily builds the AssetService so the HTTP mount
//    is cheap until first use.
//
// Kept separate from asset-service.ts so tests can inject their own
// generator/writer pair without pulling in Effect + Asset.Service.

import { Effect, Layer } from "effect"
import { lazy } from "@/util/lazy"
import { Service as AssetSvc, defaultLayer as assetLayer } from "@/business/asset/asset"
import { AssetService } from "./asset-service"
import { createLangfuseTracer } from "./tracer"
import { loadAssetAuthFromEnv } from "./http/auth"
import { buildAssetServiceApp } from "./http"
import type {
  AssetGenerator,
  AssetWriter,
  AssetWriterInput,
  AssetWriterOutput,
  GenerationOutcome,
} from "./run-asset-generation"

// ---------- writer: wraps Asset.Service.create ----------

export const defaultAssetWriter: AssetWriter = {
  async write(input: AssetWriterInput): Promise<AssetWriterOutput> {
    return Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* AssetSvc
        const row = yield* svc.create({
          projectId: input.project_id,
          type: input.type,
          key: input.key,
          title: null,
          name: input.name,
          kind: input.kind,
          url: input.url,
          prompt: input.prompt ?? null,
          refUrls: input.ref_urls,
        })
        return {
          asset_id: row.id,
          key: row.key,
          version: row.version,
          // Asset.Service stores kind on the row but the Effect-side type is
          // not as narrow as AssetKind; re-cast back to the public union.
          kind: input.kind,
          url: row.url ?? input.url,
          ref_urls: row.ref_urls,
        }
      }).pipe(Effect.provide(assetLayer)) as unknown as Effect.Effect<AssetWriterOutput, never, never>,
    )
  },
}

// ---------- generator: Phase 8 stub ----------
//
// Returns a synthetic OSS URL keyed off intent.key so every call is
// deterministic + immediately testable via curl. Real generator (Phase 9+)
// will run the mini agent loop: read skill body, pick atomic tool, drive
// the LLM through it, surface the resulting OSS url.

export const placeholderGenerator: AssetGenerator = {
  async generate(input): Promise<GenerationOutcome> {
    const ext = input.intent.kind === "shot_video" ? "mp4" : "png"
    return {
      ok: true,
      atomic_tool: "phase8-placeholder",
      url: `https://stub.assets.local/${encodeURIComponent(input.intent.key)}.${ext}`,
      ref_urls: input.intent.refs ?? [],
      langfuse_trace_id: null,
      steps: 1,
    }
  },
}

// ---------- AssetService singleton + Hono mount ----------

export const assetServiceSingleton = lazy(
  () =>
    new AssetService({
      generator: placeholderGenerator,
      writer: defaultAssetWriter,
      // Falls back to nullTracer if LANGFUSE_PUBLIC_KEY / SECRET_KEY are
      // not set (dev / CI without LF credentials still completes jobs).
      tracer: createLangfuseTracer(),
    }),
)

export const assetServiceHttpApp = lazy(() =>
  buildAssetServiceApp({
    service: assetServiceSingleton(),
    auth: loadAssetAuthFromEnv(),
  }),
)
