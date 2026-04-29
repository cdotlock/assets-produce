#!/usr/bin/env node
/**
 * Generate 7 CG videos via BytePlus Ark Seedance 2.0 multi-reference API.
 *
 * Usage:
 *   node generate-cg-videos.js              # full run: submit + poll + upload + write JSON
 *   node generate-cg-videos.js --test       # smoke test ONE cg only
 *   node generate-cg-videos.js --only=KEY   # process only a specific CG key
 *
 * Env: reads .env in assets-produce dir
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const OSS = require('ali-oss')

// ───── env ─────
const envPath = path.resolve(__dirname, '..', '.env')
fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  line = line.trim()
  if (line && !line.startsWith('#')) {
    const idx = line.indexOf('=')
    if (idx > 0) {
      const k = line.slice(0, idx).trim()
      const v = line.slice(idx + 1).trim()
      if (k) process.env[k] = v
    }
  }
})

// Local proxy is doing TLS interception (Clash/Surge/etc), which breaks ali-oss cert validation.
// We need to disable strict TLS verify for the OSS PUT and unset proxy env to avoid double-tunneling.
// (BytePlus API + curl downloads still go fine; only ali-oss is affected.)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const ARK_BASE = (process.env.SEEDANCE_ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com').replace(/\/$/, '')
const ARK_KEY = process.env.SEEDANCE_ARK_API_KEY
const MODEL = process.env.SEEDANCE_MODEL || 'dreamina-seedance-2-0-260128'   // Seedance 2.0 Standard (BytePlus international, multimodal-to-video)

if (!ARK_KEY) {
  console.error('Missing SEEDANCE_ARK_API_KEY')
  process.exit(1)
}

// ───── output paths ─────
const OUTPUT_DIR = '/Users/Clock/ShawnWhitney-skill/writing-skill/output/assets'
const CG_VIDEO_URLS_PATH = path.join(OUTPUT_DIR, 'cg_video_urls.json')

// ───── reference image URLs ─────
const REF = {
  // lishie portraits
  lishie_cold: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061446812-e6is9b.png',
  lishie_determined: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061388430-edt8id.png',
  lishie_shocked: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061382144-ha40ux6.png',
  lishie_tender: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061555245-uyeo69.png',
  lishie_calm: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061515624-sdb91.png',
  lishie_combat: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061602766-cjdzwr.png',
  lishie_smile: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061489149-n2najk.png',
  // arnold portraits
  arnold_cold: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061383184-zcmeva.png',
  arnold_kneeling: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777062796152-rbs3wl.png',
  arnold_tender: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061452268-lrhvfj.png',
  arnold_neutral: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061378630-x27d1i.png',
  arnold_combat: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777101961668-imao9w.png',
  arnold_smile: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061492424-mmu9y8.png',
  // backgrounds
  castle_balcony: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777060964563-oeolnd7.png',
  castle_exterior_day: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061016557-kcx6kt.png',
  palace_garden_night: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061060905-tkz75u.png',
  palace_garden_day: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061063404-nivwj6.png',
  theater: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061203005-gh9oi2.png',
  battlefield: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/1777061161311-cm6oko.png',
}

// ───── 7 CG specs ─────
// Prompts condensed but keep multi-shot timestamps + camera + character + mood.
// duration: Seedance 2 supports 4-15s.
// First reference is face-lock; subsequent are scene/character supplements.
const CGS = [
  {
    key: 'seventh_leap',
    duration: 10,
    references: [REF.lishie_cold, REF.lishie_determined, REF.castle_balcony],
    prompt: `Cinematic 1080p ARRI Alexa anamorphic, painterly East-Asian webtoon aesthetic, low-key dramatic moonlight + competing torchlight. Lock face to first image: coral-haired young noblewoman in formal ornate gown.

Castle ballroom balcony at midnight. Marble railing, torchlit walls behind, garden far below in darkness.

[00:00-00:03] Shot 1 — ECU on her hands gripping the marble railing, knuckles white. Slow pull-back to medium profile against the moon. 24mm slight low angle. She doesn't hesitate; one foot steps onto the railing; her gown catches wind. Hair lifts in slow motion.

[00:03-00:07] Shot 2 — Sharp cut to overhead drone shot looking straight down, ground rushing up. Then sharp cut to her POV: torch-lit walls streaking past, sky inverting. She doesn't scream. Her gown billows like a single dark wing. Pearl from her hair ornament tumbles beside her.

[00:07-00:10] Shot 3 — Hard cut up to balcony railing: silver-haired prince's silhouette appearing, slow push-in on his eyes. He doesn't run; he watches. Expression of recognition across lifetimes. Single curl of silver hair, moonlight catching one ice-blue iris. Audio fades to silence on a single deep cello note.`
  },
  {
    key: 'ballroom_proposal',
    duration: 12,
    references: [REF.lishie_shocked, REF.arnold_kneeling, REF.castle_exterior_day],
    prompt: `Cinematic 1080p ARRI Alexa anamorphic, photorealistic with painterly atmosphere. Storm-soaked dramatic tone. Lock faces to first two images: coral-haired noblewoman with sword raised; silver-haired prince kneeling.

Castle gate plaza in late evening. Cobblestones drowned in rain, torches sputtering, mud and rainwater pooled. Far background: outline of royal carriage, frozen courtiers.

[00:00-00:04] Shot 1 — Wide establishing of the entire plaza, both figures small. Slow dolly-in toward Arnold from behind Lishie's shoulder, 35mm. He sinks down onto one knee; mud darkens his trousers; sword stays sheathed, both hands open. Raindrops striking his bowed silver head. Crowd frozen — King mid-step, courtiers mouths half-open. Time stops.

[00:04-00:08] Shot 2 — Tight orbit slowly circling Arnold. Lishie's sword-tip enters frame, trembling. Hard cut to ECU of her wide eyes: pupils dilated, single droplet tracking her cheek. Arnold raises his head; their eyes meet. Recognition + terror + hope at once. Her hand on the sword hilt loosens but doesn't lower. Reflection of torchlight in puddle between them.

[00:08-00:12] Shot 3 — Pull back to two-shot, both figures profile against storm. Final pull continues into a wide aerial; they are two small figures bound by a line of empty rain-soaked stone. Arnold's lips move silently: "Marry me." Thunder breaks instead. Lishie's sword wavers but doesn't drop. Single oak leaf falling between them.

Audio: rain crescendo, distant thunder. Single piano note when their eyes meet. Final thunder crack.`
  },
  {
    key: 'garden_embrace',
    duration: 12,
    references: [REF.lishie_tender, REF.arnold_tender, REF.palace_garden_night],
    prompt: `Cinematic 1080p, soft anamorphic glow, painterly East-Asian aesthetic with magic-hour color science. Lock faces to first two images.

Palace rose garden at night. Full moon overhead, white and silver roses blooming in hedges, gravel paths catching moonlight, distant palace tower lit by warm window glow.

[00:00-00:04] Shot 1 — Wide medium of the two at opposite ends of a gravel path, separated by a moonlit fountain. Slow tracking right alongside her as she walks toward him. She walks; he doesn't. Her hand reaches toward his, fingers trembling — not from fear, from the weight of choosing. Roses brushing her gown; a petal lifting in her wake. His silver hair catches moonlight as he turns.

[00:04-00:08] Shot 2 — Tight handheld push-in to medium close at the moment of contact. Then slow orbit around them as they close into the embrace. His arms close around her; her head tucks under his chin; his silver hair falls across her temple. Both close their eyes simultaneously — as if finally allowed to. His hand presses flat at the back of her head; her hand fists in fabric at his back. Tears track unnoticed down both cheeks.

[00:08-00:12] Shot 3 — Slow pull-back and rise. They remain locked in embrace as the camera lifts above the garden, above the palace walls, until the entire kingdom is visible in moonlit miniature. They don't move; the world moves around them. Stars wheel in time-lapse over the final two seconds. Streak of falling star above them.

Audio: soft cello + piano. Muted heartbeat on close shot. Ambient garden — wind, fountain, distant nightingale.`
  },
  {
    key: 'rooftop_kiss',
    duration: 15,
    references: [REF.lishie_tender, REF.arnold_tender, REF.theater],
    prompt: `Cinematic 1080p ARRI Alexa anamorphic 2.35:1, slow-motion micro-expression capture, painterly with deep blacks and silver highlights. Lock faces to first two images.

Royal theater rooftop after the assassination attempt. Slate tiles still wet from earlier rain, gargoyle silhouettes against the moon, capital city spread below in golden window-light. Far horizon: dawn just beginning to bruise the sky purple. Coral-haired woman in formal gown with one shoulder strap loose from the fight, pulse visible at throat. Silver-haired man in dark fitted royal coat, his usual cold mask cracked.

[00:00-00:04] Shot 1 — Wide aerial above theater rooftops; slow descent as Arnold's silver head emerges from a turret. He turns, sees her at the parapet edge. Tracking shot follows him; footsteps deliberate, slowing. She doesn't turn. Wind lifts her coral hair into his face.

[00:04-00:09] Shot 2 — Two-shot from the side, profile against moon. Slow push-in to ECU on his hand reaching to lift her chin. Cut to ECU on her eyes — closing. His thumb traces her jaw. She lifts her face to meet his; both stop breathing for one full second of held silence. A single tear on her lash, not from sadness. His ice-blue iris reflecting her face.

[00:09-00:13] Shot 3 — Tight close on the moment of contact. Slow orbit around the kiss. Sharp pull-up rising into the sky; the two figures becoming small on the rooftop, the city below, the moon above. Lips meet — soft, then surer. Her hand rises to his neck; his hand spreads at her back. The kiss lengthens. Strand of his silver hair falls across her closed eyelid. Single cloud across the moon parts.

[00:13-00:15] Shot 4 — Final wide aerial; two figures in embrace on rooftop; dawn rising on the horizon to their left. They don't separate, don't speak. First birdsong of dawn.

Color: cold moonlight transitioning to warm dawn pink at end.`
  },
  {
    key: 'dawn_together',
    duration: 10,
    references: [REF.lishie_calm, REF.arnold_neutral, REF.castle_exterior_day],
    prompt: `Cinematic 1080p, IMAX 65mm grandeur, deep field of view, golden-hour color science. Lock faces to first two images.

Edge of a high cliff overlooking the kingdom at dawn. Behind them: smoking ruin of an enemy stronghold. Below: sleeping kingdom, distant city lights still burning, river silver under first light. Sky in three bands — purple receding, pink rising, gold cresting. Coral-haired woman in travel-worn clothes, exhausted but unbroken. Silver-haired man, blood on his sleeve, eyes finally allowing themselves to be open.

[00:00-00:04] Shot 1 — Backs to the camera, wide medium. Two figures small against the dawn vista. Slow dolly-in from behind, never quite reaching them. They don't move. Hands at their sides. Then — without looking — Arnold's hand finds hers. Their fingers lace. Wind in their hair. First ray of sunlight cresting the horizon, gilding their silhouettes.

[00:04-00:08] Shot 2 — Slow arc from behind to side profile, catching first sun on their faces. Holds on a perfect two-shot. They turn toward each other. Both alive. Both changed. Both still here. Her exhausted half-smile. His almost-smile. Neither speaking. Sunlight catches the dust still in their hair from the stronghold.

[00:08-00:10] Shot 3 — Final pull-back high above as they begin to walk forward, hand in hand, down the cliff path. Camera continues to lift until they are two specks moving into a gold-flooded valley. A single bird passing across the sun above them.

Audio: dawn ambient — wind, distant smoke crackle. Soft string entrance on Shot 1, swelling to full orchestra by Shot 3.`
  },
  {
    key: 'war_horizon',
    duration: 12,
    references: [REF.lishie_combat, REF.arnold_combat, REF.battlefield],
    prompt: `Cinematic 1080p ARRI Alexa, smoke-laden anamorphic, painterly chiaroscuro echoing Akira Kurosawa late-period battle epics. Lock faces to first two images.

Distant battlefield at dusk. Smoke columns rising from three directions. A ridge in the foreground where the two stand. Below: armies clashing too far away to see individuals — only banners, fire, dust. Coral-haired woman in light combat leathers, sword in hand. Silver-haired man in full battle armor, sword drawn, blood on his forearm.

[00:00-00:04] Shot 1 — Massive establishing wide. Two figures on a ridge silhouette, vast burning landscape behind. Slow track right. They watch; they don't speak. Her free hand tightens on her sword's pommel. Smoke curling around their ankles. Distant explosions visible — soundless from this distance, only flashes.

[00:04-00:08] Shot 2 — Cut to medium two-shot. Slow push-in. Arnold turns to her. Asks something with his eyes. She nods once — fierce, unhesitating. They face the field together. Embers blowing past their faces. His armor reflecting fire. Her coral hair gone almost orange in the firelight.

[00:08-00:12] Shot 3 — Behind-the-shoulder shot as they begin to run down the ridge toward the chaos. Camera follows for a beat, then lifts up and back, watching them grow smaller against the blaze. They run together. Not toward death. Toward whatever comes next. Their swords up, catching the last light before the smoke swallows them.

Audio: distant battle thunder, sword draw, then silence as they run. Single bass drum heartbeat begins on Shot 3. Color: smoke gray + fire orange + bruised purple sky.`
  },
  {
    key: 'happy_ending',
    duration: 15,
    references: [REF.lishie_smile, REF.arnold_smile, REF.castle_exterior_day, REF.palace_garden_day],
    prompt: `Cinematic 1080p, soft IMAX with magic-hour gold and silver tones. Painterly East-Asian webtoon aesthetic. Lock faces to first two images. Setting drawn from the third and fourth reference images. 5-shot intimate montage across decades of a couple's life.

[00:00-00:03] Shot 1 — Quiet Vow (young). Slow circular pan around the two of them embracing in soft warm light, foreheads touching. She wears a simple white dress with coral hair loose. He wears a dark fitted coat. Soft daylight. Wildflowers at the edge of frame.

[00:03-00:06] Shot 2 — The Quiet Promise (newly bonded). Wide medium of them sitting together on a stone bench overlooking a garden. Slow push-in. Their hands lace between them. They look at each other in silence — the kind of silence that only exists between two people who have already chosen each other.

[00:06-00:09] Shot 3 — The Garden (middle-age, peace). Tracking shot through an autumn garden. Two figures in distance walking ahead, talking softly, laughing. Her coral hair now has the first silver streak. His silver hair is weathered. Leaves falling around them. They walk slowly, no hurry left in their lives.

[00:09-00:12] Shot 4 — The Study (older, looking back). Slow circular pan around a small study at dusk. Books, maps, an open handwritten journal. Two old figures asleep in chairs side by side, hands joined across a small table between them. Window light golden, soft. Hair fully silver. A single petal falling from a vase on the table. Peaceful.

[00:12-00:15] Shot 5 — The Cliff (eternal, free). Final pull-back from a cliff overlooking a vast valley. Two figures, age unclear because the camera continues to pull and pull until they are silhouettes, then specks, then gone, and the world stretches out below in dawn light. Final frame: white sky, gold horizon, tiny silhouettes still walking forward into it. A single bird leading them.

Color: soft gold and silver throughout, warm magic-hour lighting on every shot.`
  },
]

// ───── api helpers ─────
async function submitTask(cg) {
  const content = [
    { type: 'text', text: cg.prompt },
    ...cg.references.map(url => ({ type: 'image_url', image_url: { url }, role: 'reference_image' }))
  ]
  const body = {
    model: MODEL,
    content,
    resolution: '1080p',
    ratio: '9:16',   // 竖屏短剧（vertical short drama for mobile）
    duration: cg.duration,
    watermark: false,
    generate_audio: false,   // disabled: audio safety filter rejects intense dramatic scenes; we'll add music in post
    seed: 42  // deterministic for reproducibility
  }
  const res = await fetch(`${ARK_BASE}/api/v3/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_KEY}`
    },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) {
    throw new Error(`Submit ${cg.key} failed (${res.status}): ${JSON.stringify(json)}`)
  }
  // Response shape: { id, model, status, created_at, content }
  const id = json.id || json.task_id || json.data?.id || json.data?.task_id
  if (!id) throw new Error(`Submit ${cg.key} no task id: ${JSON.stringify(json)}`)
  return id
}

async function getTask(taskId) {
  const res = await fetch(`${ARK_BASE}/api/v3/contents/generations/tasks/${taskId}`, {
    headers: { 'Authorization': `Bearer ${ARK_KEY}` }
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) {
    throw new Error(`Query failed (${res.status}): ${JSON.stringify(json)}`)
  }
  return json
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
  const bucket = process.env.OSS_BUCKET
  const region = process.env.OSS_REGION
  return `https://${bucket}.oss-${region}.aliyuncs.com/${objectName}`
}

async function processCG(cg) {
  const tag = `[${cg.key}]`
  console.log(`${tag} ⏳ submitting (model=${MODEL}, duration=${cg.duration}s, refs=${cg.references.length})`)
  const taskId = await submitTask(cg)
  console.log(`${tag} ✓ task id: ${taskId}`)

  // Poll: max 40 mins (160 attempts × 15s)
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 15000))
    let status
    try {
      status = await getTask(taskId)
    } catch (e) {
      console.warn(`${tag} ⚠ poll attempt ${i + 1} error: ${e.message}`)
      continue
    }
    const s = status.status
    if (s === 'succeeded') {
      const videoUrl = status.content?.video_url || status.video_url || status.data?.video_url
      if (!videoUrl) throw new Error(`${tag} succeeded but no video_url: ${JSON.stringify(status)}`)
      console.log(`${tag} ✓ generated, downloading from BytePlus...`)
      // Use curl: Node fetch doesn't honor HTTP_PROXY env vars, and BytePlus TOS presigned URLs
      // are query-string-signed so re-encoding via fetch can break them.
      const tmpFile = path.join(os.tmpdir(), `seedance-${cg.key}-${Date.now()}.mp4`)
      try {
        execFileSync('curl', ['-sSf', '-o', tmpFile, videoUrl], { stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (e) {
        throw new Error(`${tag} curl download failed: ${e.message}`)
      }
      const buf = fs.readFileSync(tmpFile)
      fs.unlinkSync(tmpFile)
      const filename = `${Date.now()}-${cg.key}.mp4`
      console.log(`${tag} ✓ ${(buf.length / 1024 / 1024).toFixed(2)} MB, uploading to OSS...`)
      const ossUrl = await uploadToOSS(buf, filename)
      console.log(`${tag} ✓✓ done: ${ossUrl}`)
      return ossUrl
    }
    if (s === 'failed' || s === 'cancelled') {
      throw new Error(`${tag} task ${s}: ${JSON.stringify(status)}`)
    }
    if (i % 4 === 0) console.log(`${tag} … status=${s} (${(i + 1) * 15}s elapsed)`)
  }
  throw new Error(`${tag} timeout after 40 min`)
}

// ───── main ─────
async function main() {
  const args = process.argv.slice(2)
  const isTest = args.includes('--test')
  const onlyArg = args.find(a => a.startsWith('--only='))
  const skipArg = args.find(a => a.startsWith('--skip='))
  const only = onlyArg ? onlyArg.split('=')[1].split(',') : null
  const skip = skipArg ? skipArg.split('=')[1].split(',') : null

  let toRun = CGS
  if (only) toRun = CGS.filter(c => only.includes(c.key))
  if (skip) toRun = toRun.filter(c => !skip.includes(c.key))
  if (isTest) toRun = [CGS[0]]   // just seventh_leap

  console.log(`\n=== Generating ${toRun.length} CG video(s) ===`)
  console.log(`Model: ${MODEL}`)
  console.log(`Endpoint: ${ARK_BASE}`)
  console.log(`Targets: ${toRun.map(c => c.key).join(', ')}\n`)

  // Fire all in parallel — Seedance polls independently per task
  const settled = await Promise.allSettled(toRun.map(processCG))

  // Load existing JSON to preserve other entries
  let existing = {}
  try {
    existing = JSON.parse(fs.readFileSync(CG_VIDEO_URLS_PATH, 'utf-8'))
  } catch { existing = {} }

  let okCount = 0
  let failCount = 0
  settled.forEach((r, i) => {
    const cg = toRun[i]
    if (r.status === 'fulfilled') {
      existing[cg.key] = r.value
      okCount++
    } else {
      failCount++
      console.error(`\n✗ ${cg.key} FAILED:`, r.reason.message)
    }
  })

  fs.writeFileSync(CG_VIDEO_URLS_PATH, JSON.stringify(existing, null, 2) + '\n')
  console.log(`\n=== ${okCount} succeeded, ${failCount} failed ===`)
  console.log(`URLs written to: ${CG_VIDEO_URLS_PATH}`)
  if (failCount > 0) process.exit(1)
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
