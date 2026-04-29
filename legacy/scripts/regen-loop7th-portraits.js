#!/usr/bin/env node
/**
 * regen-loop7th-portraits — overwrite specific broken portraits in loop-7th
 * by re-generating via FC gen-image (reference-image-based) and uploading
 * back to the EXACT same OSS object key as the original. compiled.json
 * doesn't change because the URL stays the same.
 *
 * Usage:
 *   node scripts/regen-loop7th-portraits.js <task-id>
 *
 * Where task-id is one of the entries in TASKS below. Or pass `all` to run
 * every task sequentially (slow — each FC call is ~30-60s).
 *
 * Why each task spec lives here, not in a JSON: the prompts are the spec.
 * They're the most important artifact — keep them under code review.
 */

const fs = require('fs')
const path = require('path')
const OSS = require('ali-oss')

// Load .env from sibling location
const envPath = path.resolve(__dirname, '..', '.env')
fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
  line = line.trim()
  if (line && !line.startsWith('#')) {
    const idx = line.indexOf('=')
    if (idx > 0) process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
})
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const FC_URL = process.env.FC_GENERATE_IMAGE_URL
const FC_TOKEN = process.env.FC_GENERATE_IMAGE_TOKEN
if (!FC_URL || !FC_TOKEN) throw new Error('FC_GENERATE_IMAGE_{URL,TOKEN} required')

const REF = {
  // Canonical/most-used portrait per character — used as identity+style anchor.
  // Picked from inventory.json's by-character "neutral" or highest-count look.
  lishie_neutral: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/lishie_neutral_1777063729_518bfc.png',
  oliver_neutral: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/oliver_neutral_1777063738_37e410.png',
  lishie1_neutral: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/lishie1_neutral_1777063756_d1999b.png',
  noble1_thinking: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/noble1_thinking_1777102684_db19e9.png',
  knight2_angry: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/knight2_angry_1777102697_8cecef.png',
  knight_captain_cold: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/knight_captain_cold_1777102696_ac0dda.png',
  arnold_combat: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/arnold_combat_1777102672_b9eff8.png',
  mary_neutral: 'https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/mary_neutral_1777063760_a6907e.png',
}

// Common boilerplate appended to every prompt. The "single figure / no
// character sheet" line is critical — it counters the failure mode where
// the model produces a turnaround with 2-3 cloned figures.
const SHARED = (refKey) =>
  ` The character matches the reference image exactly: same face, hair color & style, eye color, outfit, and color palette as the reference. Plain white or transparent background, no scenery. The figure must fill the vertical canvas from feet to head, centered horizontally. CRITICAL CONSTRAINTS: exactly ONE figure in the image; do NOT produce a character sheet, multiple poses side-by-side, or duplicate copies; do NOT add a side panel with alternate variants. Anime/manga illustration style.`

const TASKS = {
  'lishie/desperate': {
    objectKey: 'public/image/keyed/lishie_desperate_1777063737_ffc87d.png',
    refUrls: [REF.lishie_neutral],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Expression: desperate — wide blue eyes filled with anguish, parted trembling lips, furrowed brows in distress. Pose: one hand reaching toward the viewer in a pleading gesture, the other hand clutching her chest, standing with a slight forward lean.' +
      SHARED('lishie_neutral'),
  },

  'oliver/teary': {
    objectKey: 'public/image/keyed/oliver_teary_1777102679_b9fd05.png',
    refUrls: [REF.oliver_neutral],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Expression: teary — eyes glistening with tears not yet falling, mouth slightly open in suppressed sob, brows drawn up in sorrow. Pose: standing, head tilted slightly down, one hand brought up near the face as if about to wipe a tear.' +
      SHARED('oliver_neutral'),
  },

  'lishie1/smile': {
    objectKey: 'public/image/keyed/lishie1_smile_1777102692_9a2755.png',
    refUrls: [REF.lishie1_neutral],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Expression: smiling warmly — soft genuine smile, kind eyes slightly squinted, head slightly tilted. Pose: relaxed standing with hands clasped lightly in front.' +
      SHARED('lishie1_neutral'),
  },

  'noble1/angry': {
    objectKey: 'public/image/keyed/noble1_angry_1777063779_6ad5d1.png',
    refUrls: [REF.noble1_thinking],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Expression: angry — brows furrowed sharply, jaw tight, mouth pressed into a thin hard line, eyes narrowed with cold rage. Pose: standing with one hand clenched into a fist at his side, body turned slightly to project intimidation.' +
      SHARED('noble1_thinking'),
  },

  'soldiers/neutral': {
    objectKey: 'public/image/keyed/soldiers_neutral_1777063761_6fa8df.png',
    refUrls: [REF.arnold_combat],
    prompt:
      'Single full-body anime portrait of ONE generic medieval/fantasy infantry soldier (not a named hero, not a knight in heavy plate), 9:16 vertical aspect ratio. Wearing simple chainmail or padded leather armor over a green/brown tunic, a basic round helmet, and carrying a spear with a small kite shield on the back. Expression: neutral, alert, professional — eyes forward, mouth a calm flat line. Pose: standing at attention, both feet planted, weapon held vertically. The figure should clearly NOT be a noble or named character — generic anonymous footsoldier silhouette.' +
      SHARED('arnold_combat'),
  },

  'guards/neutral': {
    objectKey: 'public/image/keyed/guards_neutral_1777063768_5201ed.png',
    refUrls: [REF.knight_captain_cold],
    prompt:
      'Single full-body anime portrait of ONE generic palace guard / city watch knight (not a named hero), 9:16 vertical aspect ratio. Wearing polished steel plate armor with a blue surcoat bearing a stylized lion crest, a closed visor helmet held under one arm or worn open, and a halberd planted by the side. Expression: neutral, watchful, disciplined — eyes forward, mouth firm. Pose: standing at attention, weapon held vertically beside the body. The figure should be ONE guard, clearly anonymous (not a portrait of a specific named knight character).' +
      SHARED('knight_captain_cold'),
  },

  'woman/neutral': {
    objectKey: 'public/image/keyed/woman_neutral_1777063793_ebc1c8.png',
    refUrls: [REF.mary_neutral],
    prompt:
      'Single full-body anime portrait of a young woman in her early twenties, a blacksmith\'s daughter named Clara, 9:16 vertical aspect ratio. Working-class build (lean, muscular forearms from forge work), shoulder-length brown hair tied back practically, plain linen blouse and ankle-length skirt with a leather apron over it, sturdy boots. Expression: neutral, quietly determined — eyes forward, mouth a steady line. Pose: standing naturally, hands resting at her sides, slight outward stance suggesting she\'s used to physical work.' +
      SHARED('mary_neutral'),
  },

  'woman/worried': {
    objectKey: 'public/image/keyed/woman_worried_1777063794_ff95a2.png',
    refUrls: [REF.mary_neutral],
    prompt:
      'Single full-body anime portrait of a young woman in her early twenties, a blacksmith\'s daughter named Clara, 9:16 vertical aspect ratio. Working-class build, shoulder-length brown hair tied back practically, plain linen blouse and ankle-length skirt with a leather apron, sturdy boots. Expression: worried — brows drawn together, lower lip caught lightly between teeth, eyes downcast and thoughtful. Pose: standing, one hand brought up near her chest, the other arm wrapped lightly across her midsection in self-comfort.' +
      SHARED('mary_neutral'),
  },

  // ─── Bleeders: portraits where the original keying left an opaque
  // background (whole canvas filled with painted scene/colored backdrop).
  // FIX: re-generate from the broken portrait itself as the identity ref,
  // with a STRICT plain-white-bg prompt. This is a different failure mode
  // than the wrong-AR / cloned-figure cases above — these portraits are
  // 432×768 (correct AR) and single-figure, just never properly keyed.
  // The new generation outputs RGB white-bg, which renders cleanly against
  // the play scene (white edges blend with most backgrounds).
  'advisor/neutral': {
    objectKey: 'public/image/keyed/advisor_neutral_1777102715_8fedec.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/advisor_neutral_1777102715_8fedec.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: an elderly Chinese-style scholar/advisor with long white beard, round wire-rim glasses, dark scholar robes with ornate trim, formal scholar hat. Expression: neutral, calm, wise. Pose: standing with both hands holding a scroll in front, body facing forward. Pure flat WHITE background only — ABSOLUTELY NO scenery, NO room interior, NO desk, NO bookshelf, NO floor, NO shadows on the floor — just the isolated single figure floating against pure white. Figure fills canvas vertically. Exactly ONE figure, anime/manga style with clean lineart.',
  },
  'advisor/shocked': {
    objectKey: 'public/image/keyed/advisor_shocked_1777102716_d3303c.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/advisor_neutral_1777102715_8fedec.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: an elderly Chinese-style scholar/advisor with long white beard, round glasses, dark scholar robes, scholar hat. Expression: SHOCKED — wide eyes, dropped jaw, eyebrows raised high. Pose: standing, one hand brought up near his chest in surprise, the other dropping the scroll. Pure flat WHITE background — NO scenery, NO floor, NO room. Single figure, anime style.',
  },
  'advisor/worried': {
    objectKey: 'public/image/keyed/advisor_worried_1777102712_e2d59c.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/advisor_neutral_1777102715_8fedec.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: an elderly Chinese-style scholar/advisor with long white beard, glasses, dark robes, scholar hat. Expression: worried — brows drawn together, eyes downcast and pensive, mouth set in a concerned line. Pose: standing, one hand stroking his beard thoughtfully, the other holding the scroll loosely. Pure flat WHITE background — NO scenery, NO floor. Single figure, anime style.',
  },
  'aldric/neutral': {
    objectKey: 'public/image/keyed/aldric_neutral_1777063755_e42d72.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/aldric_neutral_1777063755_e42d72.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a young man in his late twenties with neat dark brown hair, blue eyes, wearing formal modern attire — charcoal grey blazer, white dress shirt, dark blue tie, navy V-neck knit vest underneath. Expression: neutral, composed, professional. Pose: standing relaxed, both hands at his sides. Pure flat WHITE background ONLY — NO scenery, NO floor, NO walls. Single figure, anime style with clean lineart.',
  },
  'aldric/cold': {
    objectKey: 'public/image/keyed/aldric_cold_1777102711_b2bae3.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/aldric_neutral_1777063755_e42d72.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a young man late twenties, dark brown hair, blue eyes, formal modern attire — charcoal grey blazer, white shirt, dark blue tie, navy knit vest. Expression: cold — eyes narrowed, mouth set in a hard line, slight chin lift, dispassionate. Pose: standing with arms crossed, body squared toward the viewer. Pure flat WHITE background ONLY — NO scenery, NO floor. Single figure, anime style.',
  },
  'brennan/neutral': {
    objectKey: 'public/image/keyed/brennan_neutral_1777063762_fe2285.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/brennan_neutral_1777063762_fe2285.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a young male knight in his early twenties, short brown hair swept back, polished silver plate armor with gold lion-crest on the chest, blue cape draped behind. Expression: neutral, alert, dutiful. Pose: standing with both gauntleted hands resting on the pommel of a sheathed sword in front of him. Pure flat WHITE background ONLY — NO scenery, NO floor. Single figure, anime style.',
  },
  'brennan/shocked': {
    objectKey: 'public/image/keyed/brennan_shocked_1777063789_857805.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/brennan_neutral_1777063762_fe2285.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a young male knight, short brown hair, silver plate armor with gold lion-crest, blue cape. Expression: SHOCKED — eyes wide, mouth open in a small gasp, brows raised. Pose: standing, one hand gripping the sword hilt as if about to draw, the other half-raised in disbelief. Pure flat WHITE background — NO scenery. Single figure, anime style.',
  },
  'council/neutral': {
    objectKey: 'public/image/keyed/council_neutral_1777102714_067f08.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/council_neutral_1777102714_067f08.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: an elderly distinguished councilman with neatly groomed white hair and short white beard, wearing elaborate council ceremonial robes — gold and royal blue with silver thread embroidery, a silver eagle/phoenix medallion at the chest. Expression: neutral, dignified, contemplative. Pose: standing, both hands clasped formally in front of his waist. Pure flat WHITE background ONLY — NO scenery, NO floor, NO chamber backdrop. Single figure, anime style.',
  },
  'crowd/neutral': {
    objectKey: 'public/image/keyed/crowd_neutral_1777063773_4d2acb.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/crowd_neutral_1777063773_4d2acb.png'],
    prompt:
      'A small crowd of 4 distinct ordinary modern townspeople grouped together, 9:16 vertical aspect ratio anime character portrait composition. Match the reference exactly for the 4 individuals: a young black man in a beanie and plaid shirt; a blonde teenage girl in a pale hoodie; a mustachioed middle-aged man in a beige sweater; a woman in a brown patterned scarf. Expression: neutral, mildly curious. Pose: standing close together as a small huddled group, all facing the viewer. Pure flat WHITE background ONLY — NO scenery, NO street, NO floor. Anime style. Note: a "crowd" of 4 distinct people IS the intended subject — keep all 4 visible, do not collapse to one figure.',
  },
  'knight_captain/cold': {
    objectKey: 'public/image/keyed/knight_captain_cold_1777102696_ac0dda.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/knight_captain_cold_1777102696_ac0dda.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a stern senior knight captain in his fifties, short steel-grey hair and trimmed beard, wearing dark navy military dress uniform with brass buttons and rows of medals on the chest, leather sword belt, white gloves, sword at his hip. Expression: cold — narrowed eyes, hard set jaw, faintly disapproving frown. Pose: standing at attention with one gloved hand resting on the sword pommel, the other behind his back. Pure flat WHITE background ONLY — NO scenery, NO command tent, NO barracks. Single figure, anime style.',
  },
  'raul/cold': {
    objectKey: 'public/image/keyed/raul_cold_1777102679_69daf7.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/raul_thinking_1777063775_008758.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a man in his thirties with short steel-grey hair, sharp features, wearing an ornate noble high-collar coat in deep navy and burgundy with green panels and gold embroidered feather/leaf motifs. Expression: cold — narrow eyes, indifferent flat mouth, slight downward chin tilt. Pose: standing, both hands clasped in front holding a rolled scroll, body squared. Pure flat WHITE background ONLY — NO scenery. Single figure, anime style.',
  },
  'raul/thinking': {
    objectKey: 'public/image/keyed/raul_thinking_1777063775_008758.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/raul_thinking_1777063775_008758.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a man in his thirties with short steel-grey hair, sharp features, ornate noble coat — deep navy and burgundy with green panels, gold feather embroidery. Expression: thinking — eyes looking off to the side in thought, lips slightly pursed, brow faintly furrowed. Pose: standing, one hand brought up to lightly touch his chin in contemplation, the other holding a rolled scroll. Pure flat WHITE background — NO scenery. Single figure, anime style.',
  },
  'knight2/angry': {
    objectKey: 'public/image/keyed/knight2_angry_1777102697_8cecef.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/knight2_angry_1777102697_8cecef.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a young male knight, short tousled brown hair, dark fantasy plate armor with intricate gold detailing on the shoulders and chest, dark red surcoat/cape with a gold lion sigil. Expression: angry — brows knit hard together, mouth pressed into a tight scowl, eyes narrowed with fierce intent. Pose: standing in a slight combat-ready stance, one armored hand on the sword grip at his hip. Pure flat WHITE background — NO scenery. Single figure, anime style.',
  },
  'council_member3/worried': {
    objectKey: 'public/image/keyed/council_member3_worried_1777102707_e18990.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/council_member3_worried_1777102707_e18990.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a mature woman in her fifties, short curled brown hair, wearing formal council robes — dark blue and white with gold trim and a heavy silver chain-of-office medallion. Expression: worried — brows drawn up and together in distress, mouth slightly parted, eyes wide with anxiety. Pose: standing with both hands clasped tensely up near her chest. Pure flat WHITE background ONLY — NO scenery, NO chamber. Single figure, anime style.',
  },
  'council_members/neutral': {
    objectKey: 'public/image/keyed/council_members_neutral_1777063789_3c4381.png',
    refUrls: ['https://mobai-file.oss-cn-shanghai.aliyuncs.com/public/image/keyed/council_members_neutral_1777063789_3c4381.png'],
    prompt:
      'Single full-body anime character portrait, 9:16 vertical aspect ratio. Match the reference: a dignified middle-aged councilman, short brown hair and short groomed beard, wearing dark navy/black ceremonial council robes with elaborate gold filigree trim, a heavy gold chain-of-office around the neck. Expression: neutral, formal, attentive. Pose: standing, both hands clasped formally in front of his waist. Pure flat WHITE background ONLY — NO scenery, NO chamber backdrop, NO floor. Single figure, anime style.',
  },

  'memorial_stones/neutral': {
    objectKey: 'public/image/keyed/memorial_stones_neutral_1777102689_21574c.png',
    refUrls: [],
    prompt:
      'A single weathered stone memorial standing alone in a misty field, 9:16 vertical aspect ratio, anime/manga illustration style. The stone is rough-hewn granite, roughly human-height, with worn carved inscriptions in an ancient script faintly visible. Soft moss creeps up its base. Background: muted overcast sky, dim distant trees suggested but not detailed, ground covered in pale wild grass. Lighting: soft diffuse, melancholy late-afternoon. Composition: stone centered horizontally, planted in lower-third of frame so its top reaches roughly mid-canvas, leaving sky/atmosphere above. Mood: solemn, reverent, quiet grief. Plain composition — NO characters, NO multiple stones, NO text overlay; ONE stone only as the focal element.',
  },

  'last_cell/neutral': {
    objectKey: 'public/image/keyed/last_cell_neutral_1777102696_409d3a.png',
    refUrls: [],
    prompt:
      'Interior of a single small dungeon cell viewed from inside, 9:16 vertical aspect ratio, anime/manga illustration style. Stone walls darkly weathered, a small barred window high on the back wall casting a single narrow shaft of pale moonlight onto the floor. Heavy iron-banded wooden door on the right side, padlocked. A worn straw pallet against the left wall. Empty of any people. Lighting: extremely low-key, dominated by shadow with the moonlight beam as the only highlight, cold blue-grey palette. Composition: cell interior centered, viewer\'s eye drawn to the moonlight beam in the lower-third of the frame. Mood: oppressive solitude, abandoned. NO characters, NO figures, NO text; just the empty cell as atmospheric set-piece.',
  },
}

async function generate(task) {
  console.log(`\n→ generating ${task.objectKey}`)
  console.log(`  refs: ${task.refUrls.length === 0 ? '(none)' : task.refUrls.join(', ')}`)
  // Retry on transient backend errors (Cloudflare 500/502/503/504, network).
  // The FC endpoint sits behind workers-vertexai.zenmux.ai which sometimes
  // surfaces upstream gateway errors that go away on retry.
  const maxAttempts = 4
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(FC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FC_TOKEN}` },
        body: JSON.stringify({ prompt: task.prompt, referenceImageUrls: task.refUrls }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`FC ${res.status}: ${text.slice(0, 300)}`)
      }
      const json = await res.json()
      if (!json.result) throw new Error(`FC returned no result: ${JSON.stringify(json).slice(0, 300)}`)
      console.log(`  ✓ generated (attempt ${attempt}): ${json.result}`)
      return json.result
    } catch (e) {
      lastErr = e
      const transient = /\b(500|502|503|504|ECONNRESET|ETIMEDOUT|fetch failed|network)\b/i.test(String(e.message))
      if (!transient || attempt === maxAttempts) throw e
      const backoff = 4000 * attempt
      console.log(`  ⚠️ attempt ${attempt} failed (${String(e.message).slice(0, 120)}), retrying in ${backoff}ms…`)
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
  throw lastErr
}

async function downloadAndUpload(srcUrl, objectKey) {
  const dl = await fetch(srcUrl)
  if (!dl.ok) throw new Error(`download ${srcUrl}: ${dl.status}`)
  const buf = Buffer.from(await dl.arrayBuffer())
  console.log(`  downloaded ${buf.length.toLocaleString()} bytes`)

  const client = new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    endpoint: process.env.OSS_ENDPOINT,
    secure: true,
    timeout: 300000,
  })

  console.log(`  → overwriting OSS object: ${objectKey}`)
  // OSS uploads occasionally hit a network hiccup near the end of the
  // request body — retry up to 3 times with backoff.
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await client.put(objectKey, buf, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
      })
      console.log(`  ✓ etag=${r.res.headers.etag} (attempt ${attempt})`)
      return `https://${process.env.OSS_BUCKET}.oss-${process.env.OSS_REGION}.aliyuncs.com/${objectKey}`
    } catch (e) {
      lastErr = e
      if (attempt === 3) throw e
      console.log(`  ⚠️ upload attempt ${attempt} failed (${String(e.message).slice(0, 80)}), retrying in ${5000 * attempt}ms…`)
      await new Promise((r) => setTimeout(r, 5000 * attempt))
    }
  }
  throw lastErr
}

;(async () => {
  const arg = process.argv[2]
  if (!arg) {
    console.log('available tasks:')
    Object.keys(TASKS).forEach((t) => console.log('  ' + t))
    console.log('\nrun: node scripts/regen-loop7th-portraits.js <task-id>')
    console.log('     node scripts/regen-loop7th-portraits.js all')
    process.exit(0)
  }
  const taskIds = arg === 'all' ? Object.keys(TASKS) : arg.split(',').map((s) => s.trim())
  for (const id of taskIds) {
    const task = TASKS[id]
    if (!task) {
      console.error(`unknown task: ${id}`)
      process.exit(1)
    }
    const newUrl = await generate(task)
    const finalUrl = await downloadAndUpload(newUrl, task.objectKey)
    console.log(`✓ ${id} → ${finalUrl}\n`)
  }
})().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
