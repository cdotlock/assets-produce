#!/usr/bin/env node
/**
 * Upload an already-downloaded video file to OSS and update cg_video_urls.json
 * for the specified key. Used to recover from failed-download cases without re-burning Seedance API.
 *
 * Usage: node upload-existing-video.js <local-mp4-path> <cg-key>
 */
const fs = require('fs')
const path = require('path')
const OSS = require('ali-oss')

const envPath = path.resolve(__dirname, '..', '.env')
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  line = line.trim()
  if (line && !line.startsWith('#')) {
    const idx = line.indexOf('=')
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
})

const localPath = process.argv[2]
const cgKey = process.argv[3]
if (!localPath || !cgKey) {
  console.error('Usage: node upload-existing-video.js <mp4-path> <cg-key>')
  process.exit(1)
}

const buf = fs.readFileSync(localPath)
console.log(`Loading ${localPath}: ${(buf.length / 1024 / 1024).toFixed(2)} MB`)

;(async () => {
  const client = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    endpoint: process.env.OSS_ENDPOINT || `oss-${process.env.OSS_REGION}.aliyuncs.com`,
    secure: true,
    timeout: 300000,
  })
  const filename = `${Date.now()}-${cgKey}.mp4`
  const objectName = `public/video/${filename}`
  await client.put(objectName, buf)
  const ossUrl = `https://${process.env.OSS_BUCKET}.oss-${process.env.OSS_REGION}.aliyuncs.com/${objectName}`
  console.log(`Uploaded: ${ossUrl}`)

  const jsonPath = '/Users/Clock/ShawnWhitney-skill/writing-skill/output/assets/cg_video_urls.json'
  let urls = {}
  try { urls = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) } catch {}
  urls[cgKey] = ossUrl
  fs.writeFileSync(jsonPath, JSON.stringify(urls, null, 2) + '\n')
  console.log(`Updated ${jsonPath}: ${cgKey} = ${ossUrl}`)
})().catch(e => { console.error(e); process.exit(1) })
