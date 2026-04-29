#!/usr/bin/env node
/**
 * Overwrite the broken lishie_calm portrait at its exact OSS object key.
 * The original showed 7 dress-color variants in one frame (a character sheet).
 * Replacement = figure 4 cropped clean from that same sheet, alpha-trimmed,
 * padded to 768×1376 to match the rest of the lishie keyed portrait family.
 *
 * The actual crop+pad is done in Python (PIL); this script only uploads.
 * See /tmp/lishie-fix/lishie_calm_replacement.png for the source pixels.
 */

const fs = require('fs')
const OSS = require('ali-oss')

const envPath = '/Users/Clock/moonshort/assets-produce/.env'
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  line = line.trim()
  if (line && !line.startsWith('#')) {
    const idx = line.indexOf('=')
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
})
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const TARGET_OBJECT = 'public/image/keyed/lishie_calm_1777063734_03412a.png'
const LOCAL_PNG = process.env.LOCAL_PNG || '/tmp/lishie-fix/lishie_calm_v2.png'

;(async () => {
  const buf = fs.readFileSync(LOCAL_PNG)
  console.log(`local: ${LOCAL_PNG} (${buf.length.toLocaleString()} bytes)`)

  const client = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    endpoint: process.env.OSS_ENDPOINT,
    secure: true,
    timeout: 120000,
  })

  console.log(`→ overwriting OSS object: ${TARGET_OBJECT}`)
  const res = await client.put(TARGET_OBJECT, buf, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
  })
  console.log('  put result:', { name: res.name, etag: res.res.headers.etag })

  const finalUrl = `https://${process.env.OSS_BUCKET}.oss-${process.env.OSS_REGION}.aliyuncs.com/${TARGET_OBJECT}`
  console.log('  ✓', finalUrl)
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
