// asset-service HTTP barrel — builds the four-route Hono app under
// /api/v1/assets/* and applies the Bearer auth middleware uniformly.
//
// Callers either:
//  - mount the returned Hono app directly on a parent server, or
//  - call mountAssetServiceRoutes() to get a wrapped /api/v1 prefix app
//    suitable for `app.request()` testing.

import { Hono } from "hono"
import { AssetService } from "../asset-service"
import {
  loadAssetAuthFromEnv,
  makeAssetServiceAuth,
  type AssetAuthConfig,
  type AssetAuthContext,
} from "./auth"
import { CreateRoute } from "./create"
import { StatusRoute } from "./status"
import { LookupRoute } from "./lookup"
import { CatalogRoute } from "./catalog"

export { loadAssetAuthFromEnv, makeAssetServiceAuth, tokenCanAccess } from "./auth"
export type { AssetAuthConfig, AssetAuthContext, AssetTokenSpec } from "./auth"

export interface MountAssetServiceRoutesInput {
  service: AssetService
  auth: AssetAuthConfig
}

export function buildAssetServiceApp(input: MountAssetServiceRoutesInput) {
  const app = new Hono<{ Variables: { assetToken: AssetAuthContext } }>()
  app.use("*", makeAssetServiceAuth(input.auth))
  app.route("/", CreateRoute(input.service))
  app.route("/", StatusRoute(input.service))
  app.route("/", LookupRoute(input.service))
  app.route("/", CatalogRoute(input.service))
  return app
}

// Mounted under /api/v1/assets so existing Hono parents can route("/", …) it
// or use it standalone in tests via `app.request("/api/v1/assets/...")`.
export function mountAssetServiceRoutes(input: MountAssetServiceRoutesInput) {
  const root = new Hono()
  root.route("/api/v1/assets", buildAssetServiceApp(input))
  return root
}
