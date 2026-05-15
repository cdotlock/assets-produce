import { sqliteTable, text, integer, index, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { BusinessProjectTable } from "@/business/project/project.sql"

export const AssetTable = sqliteTable(
  "business_asset",
  {
    id: text().primaryKey(),
    project_id: text()
      .notNull()
      .references(() => BusinessProjectTable.id, { onDelete: "cascade" }),
    parent_id: text().references((): AnySQLiteColumn => AssetTable.id, { onDelete: "set null" }),
    // Top-level mime-ish category (image/video/audio/script/metadata). Always
    // set. Unchanged from Phase 2.
    type: text({ enum: ["image", "video", "audio", "script", "metadata"] }).notNull(),
    // Phase 8 fine-grained asset_intent kind for Asset Service routing.
    // Nullable: legacy rows + assets created outside the Asset Service path
    // (manual uploads, internal CLI tools) may not carry one.
    kind: text({ enum: ["character_portrait", "scene_bg", "cg", "cover", "shot_image", "shot_video", "sfx"] }),
    key: text().notNull(),
    // `title` stays a human display label (set by creator UI).
    title: text(),
    // `name` is the stable lookup-by-name target used by `POST /assets/lookup`
    // and `asset_ref.name` in MSS payloads. Distinct from `title` so we can
    // store a slug-shaped identifier independent of the display label.
    name: text(),
    url: text(),
    data: text({ mode: "json" }),
    prompt: text(),
    ref_urls: text({ mode: "json" }),
    version: integer().notNull().default(1),
    is_current: integer({ mode: "boolean" }).notNull().default(true),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
    // Cursor column for `GET /assets/catalog?since=...`. Populated on insert
    // so first-write rows are still listable; refreshed on every update.
    time_updated: integer()
      .notNull()
      .$default(() => Date.now())
      .$onUpdate(() => Date.now()),
  },
  (t) => [
    uniqueIndex("uq_business_asset_project_key_version").on(t.project_id, t.key, t.version),
    index("idx_business_asset_project_key_current")
      .on(t.project_id, t.key)
      .where(sql`${t.is_current} = 1`),
    // Lookup-by-name: only index rows that actually carry a name; partial
    // index keeps it cheap when the bulk of legacy rows have name=NULL.
    index("idx_business_asset_project_name")
      .on(t.project_id, t.name)
      .where(sql`${t.name} is not null`),
    // Catalog cursor index.
    index("idx_business_asset_project_updated").on(t.project_id, t.time_updated),
  ],
)

export type AssetRow = typeof AssetTable.$inferSelect
export type AssetInsert = typeof AssetTable.$inferInsert
