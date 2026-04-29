#!/usr/bin/env node
/**
 * Sync cg_video_urls.json -> compiled.json
 *
 * Reads:
 *   - assets/cg_video_urls.json (key -> new URL)
 *   - main.backup-v2/*.json + main/*.md to map old URL -> CG key (via mapping.json)
 *
 * Strategy:
 *   1. Load mapping.json (assumed to have cg_video.<key> -> oldUrl mapping)
 *   2. Load cg_video_urls.json (key -> newUrl)
 *   3. For each key, do a string replace: oldUrl -> newUrl in compiled.json
 *
 * Fallback:
 *   If mapping.json doesn't have cg_video, take the OLD cg_video_urls.json
 *   from git/backup as the lookup; we have a baseline embedded.
 */

const fs = require('fs')
const path = require('path')

const OUT = '/Users/Clock/ShawnWhitney-skill/writing-skill/output'
const COMPILED = path.join(OUT, 'compiled.json')
const MAPPING = path.join(OUT, 'mapping.json')
const NEW_URLS = path.join(OUT, 'assets/cg_video_urls.json')
const BASE_URL = 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/'

const newUrls = JSON.parse(fs.readFileSync(NEW_URLS, 'utf-8'))

// ───── 1. Update mapping.json (canonical key→path) ─────
const mapping = JSON.parse(fs.readFileSync(MAPPING, 'utf-8'))
mapping.assets = mapping.assets || {}
mapping.assets.cg = mapping.assets.cg || {}
let mappingChanged = 0
for (const [key, fullUrl] of Object.entries(newUrls)) {
  const relPath = fullUrl.startsWith(BASE_URL) ? fullUrl.slice(BASE_URL.length) : fullUrl
  if (mapping.assets.cg[key] !== relPath) {
    mapping.assets.cg[key] = relPath
    mappingChanged++
  }
}
// keep cg keys sorted to match existing style
const sortedCG = {}
Object.keys(mapping.assets.cg).sort().forEach(k => { sortedCG[k] = mapping.assets.cg[k] })
mapping.assets.cg = sortedCG
fs.writeFileSync(MAPPING, JSON.stringify(mapping, null, 2) + '\n')
console.log(`mapping.json: ${mappingChanged} cg path(s) updated`)

// ───── 2. Update compiled.json (resolved URLs embedded in step.url) ─────
// Strategy: scan compiled.json for any URL matching pattern of an old CG video URL,
// determine which CG it corresponds to via filename match, replace with new full URL.
let compiled = fs.readFileSync(COMPILED, 'utf-8')
let replaced = 0
const report = []

// Extract all current video URLs in compiled.json
const allVideoUrls = [...new Set(compiled.match(/https:\/\/[^"\\]+\/public\/video\/[^"\\]+\.mp4/g) || [])]
// Match each found URL to a CG key by filename suffix (we use `<ts>-<key>.mp4` for new uploads)
for (const oldUrl of allVideoUrls) {
  const filename = oldUrl.split('/').pop()
  // Try to match by suffix `<key>.mp4`
  let matchedKey = null
  for (const k of Object.keys(newUrls)) {
    if (filename.endsWith(`${k}.mp4`) || filename.endsWith(`-${k}.mp4`)) {
      matchedKey = k
      break
    }
  }
  if (!matchedKey) {
    report.push(`SKIP unknown URL: ${filename}`)
    continue
  }
  const newUrl = newUrls[matchedKey]
  if (oldUrl === newUrl) {
    report.push(`SKIP ${matchedKey}: unchanged`)
    continue
  }
  const before = compiled.split(oldUrl).length - 1
  compiled = compiled.split(oldUrl).join(newUrl)
  replaced += before
  report.push(`OK ${matchedKey}: ${before} occurrence(s) replaced`)
}

// Handle keys present in cg_video_urls but never seen in compiled (e.g., very first run with random hashes).
// We also handle the legacy 1777102xxxxxxx-XXXX.mp4 names (from previous OLD generation that didn't include the cg key suffix).
const LEGACY_OLD = {
  seventh_leap:      'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/1777102045257-hqd69j.mp4',
  rooftop_kiss:      'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/1777102100294-vbv6ln.mp4',
  ballroom_proposal: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/1777102152414-wnx0l.mp4',
  garden_embrace:    'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/1777102210215-swp5gn.mp4',
  dawn_together:     'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/1777102257955-5kicp.mp4',
  happy_ending:      'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/1777102301636-s3fi8g.mp4',
  war_horizon:       'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/video/1777102348495-hvt0cx.mp4',
}
for (const [key, legacyUrl] of Object.entries(LEGACY_OLD)) {
  if (!compiled.includes(legacyUrl)) continue
  const newUrl = newUrls[key]
  if (!newUrl || newUrl === legacyUrl) continue
  const before = compiled.split(legacyUrl).length - 1
  compiled = compiled.split(legacyUrl).join(newUrl)
  replaced += before
  report.push(`OK ${key} (legacy): ${before} occurrence(s) replaced`)
}

fs.writeFileSync(COMPILED, compiled)
console.log('\ncompiled.json:')
console.log(report.join('\n'))
console.log(`=== ${replaced} URL replacement(s) total in compiled.json ===`)
