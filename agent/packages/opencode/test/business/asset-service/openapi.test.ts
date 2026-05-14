import { describe, expect, test } from "bun:test"
import path from "node:path"

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "..", "..", "..")
const SPEC_PATH = path.join(REPO_ROOT, "docs", "api", "openapi.yaml")

// We don't need a full YAML parser to verify the spec's contract — just
// assert that the right paths, operationIds, status codes, and enum
// values are present in the source text. Simpler than maintaining a
// hand-rolled parser, and stays robust to YAML formatting choices.
async function loadText(): Promise<string> {
  return await Bun.file(SPEC_PATH).text()
}

describe("docs/api/openapi.yaml", () => {
  test("is openapi 3.x with assets-produce title", async () => {
    const text = await loadText()
    expect(text).toMatch(/^openapi:\s*3\.\d/m)
    expect(text).toMatch(/title:\s*assets-produce/i)
  })

  test("declares the four Phase 8 paths", async () => {
    const text = await loadText()
    for (const route of [
      "/api/v1/assets/create:",
      "/api/v1/assets/jobs/{job_id}:",
      "/api/v1/assets/lookup:",
      "/api/v1/assets/catalog:",
    ]) {
      expect(text).toContain(route)
    }
  })

  test("each endpoint has the canonical operationId", async () => {
    const text = await loadText()
    for (const opId of ["asset.create", "asset.status", "asset.lookup", "asset.catalog.since"]) {
      expect(text).toContain(`operationId: ${opId}`)
    }
  })

  test("every endpoint advertises 401 + 403 auth responses", async () => {
    const text = await loadText()
    // Each of the 4 paths must have both 401 and 403 referenced; we just
    // assert that the spec mentions Unauthenticated and Forbidden response
    // refs at least once per endpoint section.
    const sections = ["/api/v1/assets/create:", "/api/v1/assets/jobs/{job_id}:", "/api/v1/assets/lookup:", "/api/v1/assets/catalog:"]
    for (const section of sections) {
      const idx = text.indexOf(section)
      expect(idx).toBeGreaterThan(-1)
      const nextSectionIdx = sections
        .map((s) => text.indexOf(s, idx + 1))
        .filter((i) => i > idx)
        .reduce((a, b) => Math.min(a, b), text.length)
      const slice = text.slice(idx, nextSectionIdx)
      expect(slice).toContain("Unauthenticated")
      expect(slice).toContain("Forbidden")
    }
  })

  test("ErrorEnvelope advertises every public AssetServiceErrorCode", async () => {
    const text = await loadText()
    for (const code of [
      "NOT_FOUND",
      "PROJECT_NOT_FOUND",
      "ASSET_NOT_FOUND",
      "INVALID_INPUT",
      "UNAUTHENTICATED",
      "FORBIDDEN",
      "BUDGET_EXCEEDED",
      "GENERATION_REJECTED",
      "ATOMIC_TOOL_FAILED",
      "INTERNAL",
    ]) {
      expect(text).toContain(`- ${code}`)
    }
  })

  test("AssetKind enum lists every Phase 8 sub-type", async () => {
    const text = await loadText()
    for (const kind of [
      "character_portrait",
      "scene_bg",
      "cg",
      "cover",
      "shot_image",
      "shot_video",
    ]) {
      expect(text).toContain(`- ${kind}`)
    }
  })

  test("AssetJobStatus enum is in line with code", async () => {
    const text = await loadText()
    // Pull the chunk after "AssetJobStatus:" up to the next top-level
    // schema. Inside it the enum line should contain all five statuses.
    const idx = text.indexOf("AssetJobStatus:")
    expect(idx).toBeGreaterThan(-1)
    const slice = text.slice(idx, idx + 200)
    for (const status of ["queued", "running", "succeeded", "failed", "cancelled"]) {
      expect(slice).toContain(status)
    }
  })

  test("bearerAuth security scheme is declared globally", async () => {
    const text = await loadText()
    expect(text).toMatch(/securitySchemes:\s*[\s\S]*?bearerAuth:/)
    expect(text).toMatch(/scheme:\s*bearer/)
    expect(text).toMatch(/security:\s*-\s*bearerAuth:/)
  })

  test("CatalogPage advertises items / has_more / next_cursor", async () => {
    const text = await loadText()
    const idx = text.indexOf("CatalogPage:")
    expect(idx).toBeGreaterThan(-1)
    const slice = text.slice(idx, idx + 500)
    expect(slice).toContain("items")
    expect(slice).toContain("has_more")
    expect(slice).toContain("next_cursor")
  })

  test("match_reason enum matches AssetLookupMatchReason", async () => {
    const text = await loadText()
    // Inline flow-style enum: `enum: [exact_key, key_version, …]`
    const idx = text.indexOf("match_reason:")
    expect(idx).toBeGreaterThan(-1)
    const slice = text.slice(idx, idx + 300)
    for (const reason of ["exact_key", "key_version", "name_exact", "name_substring", "no_match"]) {
      expect(slice).toContain(reason)
    }
  })
})
