#!/usr/bin/env node
/**
 * Poll specific BytePlus task IDs by id+key, download once succeeded, upload to OSS,
 * update cg_video_urls.json. Designed to recover from script crashes mid-run.
 *
 * Usage: node poll-and-upload.js <task_id_1> <key_1> [<task_id_2> <key_2>] ...
 * Example: node poll-and-upload.js cgt-... dawn_together cgt-... war_horizon
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const OSS = require('ali-oss')

const envPath = path.resolve(__dirname, '..', '.env')
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  line = line.trim()
  if (line && !line.startsWith('#')) {
    const idx = line.indexOf('=')
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
})
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const ARK_BASE = (process.env.SEEDANCE_ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com').replace(/\/$/, '')
const ARK_KEY = process.env.SEEDANCE_ARK_API_KEY
const URLS_PATH = '/Users/Clock/ShawnWhitney-skill/writing-skill/output/assets/cg_video_urls.json'

const args = process.argv.slice(2)
if (args.length < 2 || args.length % 2 !== 0) {
  console.error('Usage: poll-and-upload.js <task_id_1> <key_1> [<task_id_2> <key_2>] ...')
  process.exit(1)
}
const targets = []
for (let i = 0; i < args.length; i += 2) {
  targets.push({ taskId: args[i], key: args[i + 1] })
}

function curlGet(url) {
  // Use curl shell-out — Node fetch is unreliable through this proxy.
  const out = execFileSync('curl', [
    '-sSf', '-H', `Authorization: Bearer ${ARK_KEY}`, url
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(out.toString('utf-8'))
}

async function uploadToOSS(buffer, filename) {
  const client = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    endpoint: process.env.OSS_ENDPOINT || `oss-${process.env.OSS_REGION}.aliyuncs.com`,
    secure: true,
    timeout: 300000,
  })
  const objectName = `public/video/${filename}`
  await client.put(objectName, buffer)
  return `https://${process.env.OSS_BUCKET}.oss-${process.env.OSS_REGION}.aliyuncs.com/${objectName}`
}

async function processOne({ taskId, key }) {
  const tag = `[${key}/${taskId}]`
  console.log(`${tag} polling...`)
  for (let i = 0; i < 160; i++) {
    let status
    try {
      status = curlGet(`${ARK_BASE}/api/v3/contents/generations/tasks/${taskId}`)
    } catch (e) {
      console.warn(`${tag} ⚠ poll attempt ${i + 1}: ${e.message.slice(0, 100)}`)
      await new Promise(r => setTimeout(r, 15000))
      continue
    }
    const s = status.status
    if (i === 0 || i % 4 === 0) console.log(`${tag} status=${s} (${i * 15}s elapsed)`)
    if (s === 'succeeded') {
      const videoUrl = status.content?.video_url
      if (!videoUrl) throw new Error(`${tag} succeeded but no video_url`)
      const tmp = path.join(os.tmpdir(), `recover-${key}-${Date.now()}.mp4`)
      execFileSync('curl', ['-sSf', '-o', tmp, videoUrl], { stdio: ['ignore', 'pipe', 'pipe'] })
      const buf = fs.readFileSync(tmp)
      fs.unlinkSync(tmp)
      console.log(`${tag} downloaded ${(buf.length / 1024 / 1024).toFixed(2)} MB, uploading…`)
      const ossUrl = await uploadToOSS(buf, `${Date.now()}-${key}.mp4`)
      console.log(`${tag} ✓ ${ossUrl}`)
      return ossUrl
    }
    if (s === 'failed' || s === 'cancelled') throw new Error(`${tag} ${s}: ${JSON.stringify(status.error || status)}`)
    await new Promise(r => setTimeout(r, 15000))
  }
  throw new Error(`${tag} timeout`)
}

;(async () => {
  const results = await Promise.allSettled(targets.map(processOne))
  let urls = {}
  try { urls = JSON.parse(fs.readFileSync(URLS_PATH, 'utf-8')) } catch {}
  let ok = 0, fail = 0
  results.forEach((r, i) => {
    const t = targets[i]
    if (r.status === 'fulfilled') { urls[t.key] = r.value; ok++ }
    else { console.error(`${t.key} FAILED:`, r.reason.message); fail++ }
  })
  fs.writeFileSync(URLS_PATH, JSON.stringify(urls, null, 2) + '\n')
  console.log(`\n=== ${ok} succeeded, ${fail} failed ===`)
  console.log(`URLs written: ${URLS_PATH}`)
})().catch(e => { console.error('FATAL:', e); process.exit(1) })
