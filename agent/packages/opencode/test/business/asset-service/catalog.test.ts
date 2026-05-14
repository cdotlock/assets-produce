import { describe, expect, test } from "bun:test"
import { Catalog } from "@/business/asset-service/catalog"
import { ids, seedAsset, seedProject } from "./fixture"

const catalog = () => Catalog.fromDatabase()

describe("Catalog.lookup", () => {
  test("key-only query returns the current version", () => {
    const project_id = seedProject()
    seedAsset({ project_id, key: "k1", version: 1, is_current: false, url: "u1" })
    const { id: v2 } = seedAsset({
      project_id,
      key: "k1",
      version: 2,
      is_current: true,
      url: "u2",
      kind: "cg",
    })
    const [result] = catalog().lookup(project_id, [{ key: "k1" }])
    expect(result.asset).not.toBeNull()
    expect(result.asset?.asset_id).toBe(v2)
    expect(result.asset?.version).toBe(2)
    expect(result.asset?.url).toBe("u2")
    expect(result.asset?.kind).toBe("cg")
    expect(result.match_reason).toBe("exact_key")
  })

  test("key + version query returns that exact row even if not current", () => {
    const project_id = seedProject()
    const { id: v1 } = seedAsset({ project_id, key: "k1", version: 1, is_current: false })
    seedAsset({ project_id, key: "k1", version: 2, is_current: true })
    const [result] = catalog().lookup(project_id, [{ key: "k1", version: 1 }])
    expect(result.asset?.asset_id).toBe(v1)
    expect(result.asset?.version).toBe(1)
    expect(result.match_reason).toBe("key_version")
  })

  test("name exact match wins over substring", () => {
    const project_id = seedProject()
    const { id: exact } = seedAsset({
      project_id,
      name: "Sylvia 立绘",
      key: "exact",
    })
    seedAsset({ project_id, name: "Sylvia 立绘 v2", key: "subst" })
    const [result] = catalog().lookup(project_id, [{ name: "Sylvia 立绘" }])
    expect(result.asset?.asset_id).toBe(exact)
    expect(result.match_reason).toBe("name_exact")
  })

  test("falls back to substring when no exact name", () => {
    const project_id = seedProject()
    const { id: sub } = seedAsset({ project_id, name: "Sylvia portrait final", key: "sub" })
    const [result] = catalog().lookup(project_id, [{ name: "portrait" }])
    expect(result.asset?.asset_id).toBe(sub)
    expect(result.match_reason).toBe("name_substring")
  })

  test("substring search only considers current rows", () => {
    const project_id = seedProject()
    seedAsset({ project_id, name: "matching name", key: "old", is_current: false })
    const [result] = catalog().lookup(project_id, [{ name: "matching" }])
    expect(result.asset).toBeNull()
    expect(result.match_reason).toBe("no_match")
  })

  test("no_match when neither key nor name matches", () => {
    const project_id = seedProject()
    seedAsset({ project_id, key: "real" })
    const [k] = catalog().lookup(project_id, [{ key: "ghost" }])
    const [n] = catalog().lookup(project_id, [{ name: "nobody" }])
    expect(k.asset).toBeNull()
    expect(k.match_reason).toBe("no_match")
    expect(n.asset).toBeNull()
    expect(n.match_reason).toBe("no_match")
  })

  test("each query in a batch is resolved independently", () => {
    const project_id = seedProject()
    seedAsset({ project_id, key: "found-k" })
    const results = catalog().lookup(project_id, [{ key: "found-k" }, { key: "missing-k" }, { name: "ghost" }])
    expect(results).toHaveLength(3)
    expect(results[0].match_reason).toBe("exact_key")
    expect(results[1].match_reason).toBe("no_match")
    expect(results[2].match_reason).toBe("no_match")
  })

  test("project-scopes the lookup (asset in a different project is not returned)", () => {
    const a = seedProject()
    const b = seedProject()
    seedAsset({ project_id: a, key: "k", name: "lookup-target" })
    const [byKey] = catalog().lookup(b, [{ key: "k" }])
    const [byName] = catalog().lookup(b, [{ name: "lookup-target" }])
    expect(byKey.asset).toBeNull()
    expect(byName.asset).toBeNull()
  })
})

describe("Catalog.since", () => {
  test("returns asc-by-updated rows and a next_cursor when limit is reached", async () => {
    const project_id = seedProject()
    // Insert 5 assets with deterministic key labels; time_updated set by drizzle.
    for (let i = 0; i < 5; i++) {
      seedAsset({ project_id, key: `s/${i}` })
      // Bun's time resolution is ms; small sleep ensures monotone time_updated.
      await Bun.sleep(2)
    }
    const page1 = catalog().since({ project_id, cursor: null, limit: 3 })
    expect(page1.items).toHaveLength(3)
    expect(page1.has_more).toBe(true)
    expect(page1.next_cursor).not.toBeNull()
    // Assert ascending by updated_at.
    const u = page1.items.map((i) => i.updated_at)
    expect(u).toEqual([...u].sort((a, b) => a - b))
  })

  test("second page resumes from cursor and exhausts the set", async () => {
    const project_id = seedProject()
    for (let i = 0; i < 5; i++) {
      seedAsset({ project_id, key: `t/${i}` })
      await Bun.sleep(2)
    }
    const page1 = catalog().since({ project_id, cursor: null, limit: 3 })
    const page2 = catalog().since({ project_id, cursor: page1.next_cursor, limit: 3 })
    expect(page2.items).toHaveLength(2)
    expect(page2.has_more).toBe(false)
    expect(page2.next_cursor).toBeNull()
    // No overlap between pages.
    const seen = new Set(page1.items.map((i) => i.asset_id))
    for (const item of page2.items) expect(seen.has(item.asset_id)).toBe(false)
  })

  test("has_more=false when fewer rows than limit exist", () => {
    const project_id = seedProject()
    seedAsset({ project_id, key: "only" })
    const page = catalog().since({ project_id, cursor: null, limit: 50 })
    expect(page.items).toHaveLength(1)
    expect(page.has_more).toBe(false)
    expect(page.next_cursor).toBeNull()
  })

  test("project-scopes (rows from another project don't appear)", () => {
    const a = seedProject()
    const b = seedProject()
    seedAsset({ project_id: a, key: "outsider" })
    const page = catalog().since({ project_id: b, cursor: null, limit: 10 })
    expect(page.items).toHaveLength(0)
    expect(page.has_more).toBe(false)
  })

  test("malformed cursor falls back to start of catalog (no throw)", () => {
    const project_id = seedProject()
    seedAsset({ project_id, key: "x" })
    const page = catalog().since({ project_id, cursor: "not-a-cursor", limit: 5 })
    // The catalog accepts the malformed cursor and re-starts the scan.
    expect(page.items).toHaveLength(1)
  })

  test("respects limit clamping (limit ≤ 0 treated as default)", () => {
    const project_id = seedProject()
    for (let i = 0; i < 3; i++) seedAsset({ project_id, key: `c/${i}` })
    const page = catalog().since({ project_id, cursor: null, limit: 0 })
    // 0 / negative → catalog uses its default limit; we just assert it
    // returned all 3 in one page.
    expect(page.items).toHaveLength(3)
  })

  test("only emits is_current rows", () => {
    const project_id = seedProject()
    seedAsset({ project_id, key: "v1", version: 1, is_current: false })
    seedAsset({ project_id, key: "v1", version: 2, is_current: true })
    const page = catalog().since({ project_id, cursor: null, limit: 10 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0].version).toBe(2)
  })
})

describe("Catalog cursor encoding", () => {
  test("encode/decode round-trip", () => {
    const cursor = Catalog.encodeCursor({ time_updated: 1700000000000, id: ids.asset() })
    const parsed = Catalog.decodeCursor(cursor)
    expect(parsed?.time_updated).toBe(1700000000000)
    expect(typeof parsed?.id).toBe("string")
  })

  test("decode of garbage returns null", () => {
    expect(Catalog.decodeCursor("not-a-cursor")).toBeNull()
    expect(Catalog.decodeCursor("")).toBeNull()
  })
})
