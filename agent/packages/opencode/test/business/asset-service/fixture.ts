// Seed helpers for the Phase 8 asset-service test suite. Imported by repo /
// catalog / intent-to-skill / run-asset-generation / asset-service tests so
// they share a single source of truth for "make a project / make an asset".

import { Database } from "@/storage/db"
import { AssetTable } from "@/business/asset/asset.sql"
import { BusinessProjectTable } from "@/business/project/project.sql"
import { UserTable } from "@/business/user/user.sql"
import type { AssetKind } from "@/business/asset-service/types"

export const fresh = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 12)

export const ids = {
  user: () => `user_${fresh()}`,
  project: () => `proj_${fresh()}`,
  asset: () => `asset_${fresh()}`,
  job: () => `job_${fresh()}`,
}

export function seedUser(): string {
  const db = Database.Client()
  const id = ids.user()
  db.insert(UserTable)
    .values({ id, username: `u_${fresh()}`, password_hash: "x", role: "creator" })
    .run()
  return id
}

export function seedProject(ownerId?: string): string {
  const db = Database.Client()
  const owner = ownerId ?? seedUser()
  const id = ids.project()
  db.insert(BusinessProjectTable)
    .values({ id, type: "novel", title: `test_${fresh()}`, owner_id: owner })
    .run()
  return id
}

export interface SeedAssetOpts {
  project_id: string
  key?: string
  version?: number
  is_current?: boolean
  name?: string | null
  kind?: AssetKind | null
  url?: string | null
  ref_urls?: unknown
  type?: "image" | "video" | "audio" | "script" | "metadata"
}

export function seedAsset(opts: SeedAssetOpts): { id: string; key: string } {
  const db = Database.Client()
  const id = ids.asset()
  const key = opts.key ?? `seed/${fresh()}`
  db.insert(AssetTable)
    .values({
      id,
      project_id: opts.project_id,
      type: opts.type ?? "image",
      key,
      version: opts.version ?? 1,
      is_current: opts.is_current ?? true,
      name: opts.name ?? null,
      kind: opts.kind ?? null,
      url: opts.url ?? null,
      ref_urls: opts.ref_urls ?? null,
    })
    .run()
  return { id, key }
}
