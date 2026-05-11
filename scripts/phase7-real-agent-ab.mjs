#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..")
const DB = process.env.OPENCODE_AGENT_DB ?? join(homedir(), ".local/share/opencode/agent-local.db")
const DEFAULT_MODEL = "anthropic/claude-opus-4-6"
const KNOWLEDGE_DIR = "knowledge/novel-to-video"
const STYLE_PRESETS = JSON.parse(readFileSync(join(ROOT, KNOWLEDGE_DIR, "image-style-presets.json"), "utf8"))

const CASES = [
  {
    id: "case1_ep2_shot1_cemetery_departure",
    episode: 2,
    shot: "shot_1",
    title: "EP2 Shot 1 · 公墓对峙离开",
    brief:
      "公墓里 Sylvia 正面逼问 James 要答案；James 沉默且没有松开 Kennedy；Sylvia 以转身离开代替崩溃，James 从背后叫她停下但她不停。",
    expectedCharacters: ["Sylvia", "James", "Kennedy"],
    expectedScene: "新月领地 公墓",
    expectedPhrases: ["I need an answer, James", "Sylvia. Stop", "公墓", "转身", "不回头"],
    forbiddenPhrases: ["Daisy", "Luna Miller", "Huxley", "客厅", "The Pack needed an heir"],
  },
  {
    id: "case2_ep2_shot2_living_room_alpha_command",
    episode: 2,
    shot: "shot_2",
    title: "EP2 Shot 2 · 客厅 Alpha 命令",
    brief:
      "Sylvia 进入银月领地豪宅客厅质问 James 命定羁绊正在消失；James 拒绝回答并释放 Alpha 命令；Sylvia 双腿下沉、攥住椅背、硬撑着没有跪下。",
    expectedCharacters: ["Sylvia", "James"],
    expectedScene: "银月领地 豪宅 客厅",
    expectedPhrases: ["Our bond is almost gone", "Answer the question", "Alpha", "椅背", "没有跪"],
    forbiddenPhrases: ["Daisy冲进", "Luna Miller", "The Pack needed an heir"],
  },
  {
    id: "case3_ep2_shot3_group_entrance",
    episode: 2,
    shot: "shot_3",
    title: "EP2 Shot 3 · 客厅势力登场",
    brief:
      "Daisy 冲入挡在 Sylvia 前面并质问 Alpha 命令；James 的压制波及 Daisy；Huxley 出现在门口；Luna Miller 入场并以 Enough 终止压制。",
    expectedCharacters: ["Sylvia", "James", "Daisy", "Huxley", "Luna Miller"],
    expectedScene: "银月领地 豪宅 客厅",
    expectedPhrases: ["How could you suppress her", "Enough", "Daisy", "Huxley", "Luna Miller"],
    forbiddenPhrases: ["The Pack needed an heir", "You were the solution", "玩家选择"],
  },
  {
    id: "case4_ep2_shot4_truth_reveal",
    episode: 2,
    shot: "shot_4",
    title: "EP2 Shot 4 · 真相宣判",
    brief:
      "Alpha 命令停止后，Luna Miller 宣布 Sylvia 的职责只是 Luna 和 Mother；Sylvia 指出 Kennedy 无法生育且一切被安排；Luna Miller 说出 The Pack needed an heir. You were the solution.",
    expectedCharacters: ["Sylvia", "James", "Daisy", "Huxley", "Luna Miller"],
    expectedScene: "银月领地 豪宅 客厅",
    expectedPhrases: ["Focus on your duties", "Kennedy couldn't have children", "The Pack needed an heir", "You were the solution"],
    forbiddenPhrases: ["公墓", "咖啡馆", "Daisy扑过来"],
  },
  {
    id: "case5_ep2_shot5_silent_pact",
    episode: 2,
    shot: "shot_5",
    title: "EP2 Shot 5 · 两人无声盟约",
    brief:
      "Luna Miller、James、Huxley 离开后，客厅只剩 Sylvia 和 Daisy。Daisy 扑过来抓住 Sylvia 手臂；两人对视；Sylvia 视线落在 Daisy 手腕压痕上又抬回去，无对白，进入选择时刻。",
    expectedCharacters: ["Sylvia", "Daisy"],
    expectedScene: "银月领地 豪宅 客厅",
    expectedPhrases: ["无对白", "Daisy", "手腕", "压痕", "对视"],
    forbiddenPhrases: ["James开口", "Luna Miller出现", "Huxley出现", "I heard every word"],
  },
]

const REFERENCE_FILES = [
  [`${KNOWLEDGE_DIR}/langfuse-draft.md`, "rules/reference-workflow.md"],
  [`${KNOWLEDGE_DIR}/prompt-only-contract.md`, "rules/prompt-only-contract.md"],
  [`${KNOWLEDGE_DIR}/video-prompt-standard.md`, "rules/video-prompt-standard.md"],
  [`${KNOWLEDGE_DIR}/nine-section-template.md`, "references/nine-section-template.md"],
  [`${KNOWLEDGE_DIR}/character-reference-policy.md`, "references/character-reference-policy.md"],
  [`${KNOWLEDGE_DIR}/seedance-core-lessons.md`, "references/seedance-core-lessons.md"],
  [`${KNOWLEDGE_DIR}/director-playbook-core.md`, "references/director-playbook-core.md"],
  [`${KNOWLEDGE_DIR}/shot-id-policy.md`, "references/shot-id-policy.md"],
  [`${KNOWLEDGE_DIR}/videoctl-tool-reference.md`, "references/videoctl-tool-reference.md"],
  [`${KNOWLEDGE_DIR}/image-style-presets.json`, "style/legacy-style-presets.json"],
]

const CANDIDATE_REFERENCE_FILES = [
  [`${KNOWLEDGE_DIR}/prompt-only-contract.md`, "rules/prompt-only-contract.md"],
  [`${KNOWLEDGE_DIR}/video-prompt-standard.md`, "rules/video-prompt-standard.md"],
  [`${KNOWLEDGE_DIR}/nine-section-template.md`, "references/nine-section-template.md"],
  [`${KNOWLEDGE_DIR}/character-reference-policy.md`, "references/character-reference-policy.md"],
  [`${KNOWLEDGE_DIR}/seedance-core-lessons.md`, "references/seedance-core-lessons.md"],
  [`${KNOWLEDGE_DIR}/director-playbook-core.md`, "references/director-playbook-core.md"],
  [`${KNOWLEDGE_DIR}/shot-id-policy.md`, "references/shot-id-policy.md"],
  [`${KNOWLEDGE_DIR}/videoctl-tool-reference.md`, "references/videoctl-tool-reference.md"],
  [`${KNOWLEDGE_DIR}/image-style-presets.json`, "style/image-style-presets.json"],
]

const REFERENCE_REQUIRED_FILES = [
  "README.md",
  "case.json",
  "rules/reference-workflow.md",
  "rules/prompt-only-contract.md",
  "rules/video-prompt-standard.md",
  "references/nine-section-template.md",
  "references/character-reference-policy.md",
  "references/seedance-core-lessons.md",
  "references/director-playbook-core.md",
  "references/shot-id-policy.md",
  "references/videoctl-tool-reference.md",
  "style/legacy-style-presets.json",
  "inventory/assets.json",
]

const CANDIDATE_REQUIRED_FILES = [
  "README.md",
  "case.json",
  "rules/prompt-only-contract.md",
  "rules/video-prompt-standard.md",
  "references/nine-section-template.md",
  "references/character-reference-policy.md",
  "references/seedance-core-lessons.md",
  "references/director-playbook-core.md",
  "references/shot-id-policy.md",
  "references/videoctl-tool-reference.md",
  "style/image-style-presets.json",
  "inventory/assets.json",
]

function parseArgs(argv) {
  const args = {
    runId: new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, ""),
    reps: 3,
    cases: CASES.map((c) => c.id),
    sides: ["reference", "candidate"],
    model: DEFAULT_MODEL,
    pilot: false,
    clean: false,
    referenceRunner: "opencode",
    reevaluate: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--run-id") args.runId = argv[++i]
    else if (arg === "--reps") args.reps = Number(argv[++i])
    else if (arg === "--cases") args.cases = argv[++i].split(",").map((x) => x.trim()).filter(Boolean)
    else if (arg === "--sides") args.sides = argv[++i].split(",").map((x) => x.trim()).filter(Boolean)
    else if (arg === "--model") args.model = argv[++i]
    else if (arg === "--pilot") {
      args.pilot = true
      args.reps = 1
      args.cases = [CASES[0].id]
    } else if (arg === "--clean") args.clean = true
    else if (arg === "--reference-runner") args.referenceRunner = argv[++i]
    else if (arg === "--reevaluate") args.reevaluate = argv[++i]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function writeJSON(path, value) {
  ensureDir(dirname(path))
  writeFileSync(path, JSON.stringify(value, null, 2))
}

function copyText(src, dst) {
  const from = join(ROOT, src)
  if (!existsSync(from)) throw new Error(`Missing reference file: ${src}`)
  ensureDir(dirname(dst))
  writeFileSync(dst, readFileSync(from, "utf8"))
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function shell(args, opts = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: opts.cwd ?? ROOT,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeout ?? 60_000,
    maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, ...(opts.env ?? {}) },
  })
  return result
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function sqliteJSON(sql) {
  if (!existsSync(DB)) return []
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = shell(["sqlite3", "-json", DB, sql], { timeout: 30_000 })
    if (res.status === 0) {
      const out = res.stdout.trim()
      return out ? JSON.parse(out) : []
    }
    if (!/database is locked/i.test(`${res.stderr}\n${res.stdout}`)) return []
    sleepMs(250 * (attempt + 1))
  }
  return []
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function listFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name)
    if (name.isDirectory()) out.push(...listFiles(full))
    else out.push(full)
  }
  return out
}

function sidecarURL(path) {
  const urlPath = `${path}.url`
  if (!existsSync(urlPath)) return null
  return readFileSync(urlPath, "utf8").trim() || null
}

function buildAssetInventory() {
  const roots = [
    join(ROOT, "video-agent-test/works/silver-moon-manor/assets"),
    join(ROOT, "video-agent-test/works/silver-moon-manor/ref-frames/EP2"),
  ]
  return roots.flatMap((root) =>
    listFiles(root)
      .filter((file) => !file.endsWith(".url"))
      .map((file) => ({
        sourcePath: relative(ROOT, file),
        promptPath: relative(join(ROOT, "video-agent-test"), file),
        kind: file.includes("/ref-frames/") ? "ref-frame" : "asset",
        url: sidecarURL(file),
      })),
  )
}

function prepareWorkspace(workspaceRoot, side, testCase, rep) {
  const workspacePath = join(workspaceRoot, "workspaces", side, testCase.id, `rep-${rep}`)
  rmSync(workspacePath, { recursive: true, force: true })
  ensureDir(workspacePath)
  const workspace = realpathSync(workspacePath)

  const filesToCopy = side === "candidate" ? CANDIDATE_REFERENCE_FILES : REFERENCE_FILES
  for (const [src, dst] of filesToCopy) copyText(src, join(workspace, dst))
  writeJSON(join(workspace, "inventory/assets.json"), buildAssetInventory())
  copyText(
    `video-agent-test/works/silver-moon-manor/scripts/ep_${testCase.episode}.json`,
    join(workspace, `works/silver-moon-manor/scripts/ep_${testCase.episode}.json`),
  )
  writeJSON(join(workspace, "case.json"), {
    ...testCase,
    scriptPath: `works/silver-moon-manor/scripts/ep_${testCase.episode}.json`,
    forbiddenReferenceFiles: [
      "video-agent-test/ablation/**",
      "video-agent-test/works/**/episodes/**",
      "video-agent-test/archive/**",
      "authority-prompt-template.md",
    ],
  })
  ensureDir(join(workspace, "output"))
  writeFileSync(
    join(workspace, "README.md"),
    [
      "# Prompt-only AB workspace",
      "",
      "Only files in this temporary workspace are allowed inputs.",
      "Do not read historical answer prompts, ablation outputs, archive folders, or authority-prompt-template.md.",
      "Do not call image/video generation, upload, live submit, download, or frame extraction.",
      "Write AB artifacts into the output/ directory. Do not put full prompt markdown inside final JSON.",
      "",
    ].join("\n"),
  )
  return workspace
}

function buildTaskPrompt(side, testCase, workspace) {
  const outputDir = join(workspace, "output")
  const requiredFiles = (side === "candidate" ? CANDIDATE_REQUIRED_FILES : REFERENCE_REQUIRED_FILES).concat([
    `works/silver-moon-manor/scripts/ep_${testCase.episode}.json`,
  ])
  const shared = [
    "You are running a prompt-only AB test. Do not generate images or videos.",
    "Prompt-only means write prompt artifacts only: no media generation, no upload/submit/download/extract, and no live URL validation.",
    "You must read only the files inside this temporary workspace.",
    "Never read or infer from historical answer prompts, ablation outputs, archive folders, or authority-prompt-template.md.",
    "Do not call Bash, curl, videoctl submit/upload/download/extract/run-shot, generate-image, generate-video, concat, crop, or remote skill tools.",
    "Allowed local video tool checks are opencode `videoctl` operations: prompt_review, payload, prompt_compare, submit_dry_run, and status. Do not use it for live submit or live URL validation.",
    "Use Read/Grep/Glob-style file inspection if tools are available. If a tool is unavailable, state that in files_read_notes.",
    `Temporary workspace root: ${workspace}`,
    `Output directory: ${outputDir}`,
    "When writing files, use the absolute output paths listed below exactly.",
    "",
    `CASE: ${testCase.title}`,
    `TARGET BRIEF: ${testCase.brief}`,
    `SCRIPT: works/silver-moon-manor/scripts/ep_${testCase.episode}.json`,
    "",
    "Required source files to inspect:",
    ...requiredFiles.map((file) => `- ${file}`),
    "",
    "Write these files exactly:",
    `- ${join(outputDir, "image-prompts.json")}: array of {type:'portrait'|'costume'|'scene'|'shot_anchor', key, title, prompt, ref_paths, source_fields}.`,
    `- ${join(outputDir, "video-prompt.md")}: full prompt.md with YAML frontmatter and the nine sections.`,
    `- ${join(outputDir, "legacy-video-prompt.json")}: {key,title,shot_function,prev_shot_recap,next_shot_setup,prompt,definition,duration,refUrls}.`,
    `- ${join(outputDir, "self-review.json")}: {passed:boolean,issues:string[],summary:string}.`,
    `- ${join(outputDir, "trace-summary.json")}: {files_read:string[],files_read_notes:string,behavior_trace_summary:string[],image_video_consistency_notes:string[]}.`,
    `- ${join(outputDir, "manifest.json")}: {case_id,side,files:['image-prompts.json','video-prompt.md','legacy-video-prompt.json','self-review.json','trace-summary.json']}.`,
    "",
    "Final response must be one compact JSON object only: {\"status\":\"done\",\"case_id\":\"...\",\"side\":\"...\"}.",
    "Do not wrap the final JSON in markdown fences.",
  ]

  if (side === "reference") {
    return [
      "Act as the reference production workflow:",
      "- For video prompt behavior, follow the distilled local reference workflow in rules/reference-workflow.md and the local rules bundle.",
      "- For image/material prompt behavior, follow the local style presets exactly.",
      "- Do a mental Worker pass and a mental Reviewer pass, but do not spawn live media jobs.",
      ...shared,
    ].join("\n")
  }

  return [
    "Act as the candidate assets-produce agent-native CLI replacement:",
    "- Do not call the `skill` tool. This AB run tests the local prompt-only contract, not the Langfuse `novel-to-video` body.",
    "- Keep the architecture agent-native: atomic image prompt derivation + local prompt contract reasoning; no hardcoded workflow service.",
    "- Use a compact single-agent worker/reviewer pass: read required files, derive the prompt plan, write all artifacts, self-review once.",
    "- Produce artifacts that could replace the reference production workflow.",
    ...shared,
  ].join("\n")
}

function runOpencode({ side, workspace, prompt, outDir, model }) {
  const started = Date.now() - 1_000
  const workspaceReal = realpathSync(workspace)
  const args = [
    "agent/dist/agent.mjs",
    "run",
    "--format",
    "json",
    "--model",
    model,
    "--variant",
    "max",
    "--timeout",
    "900",
    "--dangerously-skip-permissions",
    "--dir",
    workspaceReal,
    "--title",
    `phase7-real-ab-${side}`,
  ]
  const t0 = Date.now()
  const result = shell(["bun", ...args], { input: prompt, timeout: 20 * 60_000 })
  const elapsedMs = Date.now() - t0

  writeFileSync(join(outDir, "stdout.jsonl"), result.stdout ?? "")
  writeFileSync(join(outDir, "stderr.log"), result.stderr ?? "")
  writeJSON(join(outDir, "process.json"), {
    runner: "opencode",
    command: ["bun", ...args.map((x) => (x === prompt ? "<prompt>" : x))],
    status: result.status,
    signal: result.signal,
    elapsedMs,
    started,
  })

  const rows = sqliteJSON(
    [
      "select id as message_id, session_id, data",
      "from message",
      "where json_extract(data,'$.role') = 'assistant'",
      `and json_extract(data,'$.path.cwd') in (${sqlString(workspace)}, ${sqlString(workspaceReal)})`,
      `and json_extract(data,'$.time.created') >= ${started}`,
      "order by json_extract(data,'$.time.created') desc",
      "limit 1",
    ].join(" "),
  )
  const message = rows[0]
  if (!message) {
    return { elapsedMs, process: result, assistantText: "", assistant: null, parts: [] }
  }

  const messageRows = sqliteJSON(
    [
      "select id as message_id, session_id, data",
      "from message",
      `where session_id = ${sqlString(message.session_id)}`,
      "and json_extract(data,'$.role') = 'assistant'",
      `and json_extract(data,'$.time.created') >= ${started}`,
      "order by json_extract(data,'$.time.created') asc",
    ].join(" "),
  )
  const assistantMessages = messageRows.map((row) => ({
    messageID: row.message_id,
    data: JSON.parse(row.data),
  }))
  const assistant = assistantMessages.at(-1)?.data ?? JSON.parse(message.data)
  const tokenTotals = assistantMessages.reduce(
    (acc, item) => {
      const tokens = item.data.tokens ?? {}
      acc.total += tokens.total ?? 0
      acc.input += tokens.input ?? 0
      acc.output += tokens.output ?? 0
      acc.reasoning += tokens.reasoning ?? 0
      acc.cacheWrite += tokens.cache?.write ?? 0
      acc.cacheRead += tokens.cache?.read ?? 0
      acc.cost += item.data.cost ?? 0
      return acc
    },
    { total: 0, input: 0, output: 0, reasoning: 0, cacheWrite: 0, cacheRead: 0, cost: 0 },
  )
  const partRows = sqliteJSON(
    `select id, message_id, session_id, time_created, data from part where session_id = ${sqlString(
      message.session_id,
    )} order by time_created asc`,
  )
  const parts = partRows.map((row) => ({ ...row, data: JSON.parse(row.data) }))
  writeJSON(join(outDir, "opencode-message.json"), {
    messageID: assistantMessages.at(-1)?.messageID ?? message.message_id,
    sessionID: message.session_id,
    assistant,
    assistantMessages,
    tokenTotals,
  })
  writeJSON(join(outDir, "trace-parts.json"), parts)

  const assistantText = parts
    .filter((row) => row.message_id === message.message_id)
    .map((row) => row.data)
    .filter((part) => part.type === "text" && part.time?.end)
    .map((part) => part.text)
    .join("\n")
    .trim()
  writeFileSync(join(outDir, "assistant-output.txt"), assistantText)

  return { elapsedMs, process: result, assistantText, assistant, assistantMessages, tokenTotals, parts, sessionID: message.session_id }
}

function parseJSONOutput(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
  try {
    return { value: JSON.parse(trimmed), error: null }
  } catch {}
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}")
  if (start >= 0 && end > start) {
    try {
      return { value: JSON.parse(trimmed.slice(start, end + 1)), error: null }
    } catch (error) {
      return { value: null, error: String(error) }
    }
  }
  return { value: null, error: "No JSON object found in assistant output" }
}

function readTextOptional(path) {
  if (!existsSync(path)) return { value: null, error: `missing ${path}` }
  try {
    return { value: readFileSync(path, "utf8"), error: null }
  } catch (error) {
    return { value: null, error: String(error) }
  }
}

function readJSONOptional(path) {
  const text = readTextOptional(path)
  if (!text.value) return text
  try {
    return { value: JSON.parse(text.value), error: null }
  } catch (error) {
    return { value: null, error: `${path}: ${String(error)}` }
  }
}

function readAgentArtifacts(workspace, assistantText) {
  const outputDir = join(workspace, "output")
  const fallback = parseJSONOutput(assistantText)
  const manifest = readJSONOptional(join(outputDir, "manifest.json"))
  const imagePrompts = readJSONOptional(join(outputDir, "image-prompts.json"))
  const legacyPrompt = readJSONOptional(join(outputDir, "legacy-video-prompt.json"))
  const selfReview = readJSONOptional(join(outputDir, "self-review.json"))
  const trace = readJSONOptional(join(outputDir, "trace-summary.json"))
  const videoPrompt = readTextOptional(join(outputDir, "video-prompt.md"))

  const fallbackValue = fallback.value ?? {}
  const fallbackVideo = fallbackValue.video_prompt ?? fallbackValue.videoPrompt ?? {}
  const value = {
    case_id: manifest.value?.case_id ?? fallbackValue.case_id,
    side: manifest.value?.side ?? fallbackValue.side,
    files_read: trace.value?.files_read ?? fallbackValue.files_read ?? [],
    files_read_notes: trace.value?.files_read_notes ?? fallbackValue.files_read_notes ?? "",
    behavior_trace_summary: trace.value?.behavior_trace_summary ?? fallbackValue.behavior_trace_summary ?? [],
    image_prompts: Array.isArray(imagePrompts.value)
      ? imagePrompts.value
      : Array.isArray(fallbackValue.image_prompts)
        ? fallbackValue.image_prompts
        : [],
    video_prompt: {
      markdown: videoPrompt.value?.trim() || fallbackVideo.markdown || fallbackValue.video_prompt_md || "",
      legacy_json: legacyPrompt.value ?? fallbackVideo.legacy_json ?? fallbackValue.legacy_json ?? null,
    },
    image_video_consistency_notes:
      trace.value?.image_video_consistency_notes ?? fallbackValue.image_video_consistency_notes ?? [],
    self_review: selfReview.value ?? fallbackValue.self_review ?? null,
    manifest: manifest.value ?? null,
  }

  const errors = [manifest, imagePrompts, legacyPrompt, selfReview, trace, videoPrompt]
    .map((item) => item.error)
    .filter(Boolean)
  const complete =
    Boolean(value.case_id) &&
    Boolean(value.side) &&
    Array.isArray(value.files_read) &&
    value.files_read.length > 0 &&
    Array.isArray(value.image_prompts) &&
    value.image_prompts.length > 0 &&
    Boolean(value.video_prompt.markdown) &&
    Boolean(value.self_review)
  return {
    value: complete || fallback.value ? value : null,
    ok: complete,
    error: complete ? null : errors.join("; ") || fallback.error || "Incomplete output artifacts",
    fallback,
  }
}

function copyAgentOutput(workspace, outDir) {
  const src = join(workspace, "output")
  const dst = join(outDir, "agent-output")
  rmSync(dst, { recursive: true, force: true })
  if (existsSync(src)) cpSync(src, dst, { recursive: true })
}

function markdownFromResult(parsed) {
  const markdown = parsed?.video_prompt?.markdown ?? parsed?.videoPrompt?.markdown ?? parsed?.video_prompt_md
  if (typeof markdown === "string" && markdown.trim()) return markdown.trim()
  const legacy = parsed?.video_prompt?.legacy_json ?? parsed?.legacy_json
  if (legacy?.prompt) {
    return [
      "---",
      `shot_id: ${legacy.key ?? "unknown"}`,
      `duration: ${legacy.duration ?? 12}s`,
      "ratio: 9:16",
      `shot_function: ${legacy.shot_function ?? ""}`,
      `prev_shot_recap: ${legacy.prev_shot_recap ?? ""}`,
      `next_shot_setup: ${legacy.next_shot_setup ?? ""}`,
      "assets:",
      "  images: []",
      "  videos: []",
      "---",
      legacy.prompt,
    ].join("\n")
  }
  return ""
}

function sectionGold(testCase) {
  const template = readFileSync(join(ROOT, KNOWLEDGE_DIR, "nine-section-template.md"), "utf8")
  const body = template
    .replace(/^#.*\n+/, "")
    .replace(/```yaml\n[\s\S]*?\n```/, "")
    .trim()
  return [
    "---",
    `shot_id: ${testCase.shot}`,
    "duration: 12s",
    "ratio: 9:16",
    `shot_function: ${testCase.brief}`,
    `prev_shot_recap: ${testCase.expectedScene}`,
    `next_shot_setup: ${testCase.expectedPhrases.join(" / ")}`,
    "assets:",
    "  images: []",
    "  videos: []",
    "---",
    "",
    body,
  ].join("\n")
}

function runCLI(args, outPath) {
  const result = shell(["bun", "agent/dist/agent.mjs", ...args], { timeout: 60_000 })
  writeJSON(outPath, {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  })
  return result
}

function maybeParseCommandJSON(result) {
  const text = result.stdout?.trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function hasAny(text, phrases) {
  return phrases.filter((phrase) => text.includes(phrase))
}

function stripForbiddenSections(markdown) {
  const withoutFrontmatter = markdown.replace(/^---\s*[\s\S]*?\n---\s*/m, "\n")
  const withoutForbiddenSection = withoutFrontmatter.replace(
    /\n##\s*(?:⑧|8[.)]?|8\.?)\s*(?:禁止事项|Forbidden Items|Forbidden|Prohibitions)[\s\S]*?(?=\n##\s*(?:⑨|9[.)]?|9\.?)|\s*$)/gi,
    "\n",
  )
  return withoutForbiddenSection
    .split("\n")
    .filter((line) => !/(next_shot_setup|next scene|next shot|下一镜|下一场|下个镜头|禁止|严禁|不得|排除|exclude|forbidden|prohibit)/i.test(line))
    .join("\n")
}

function toolCalls(parts) {
  return parts
    .map((row) => row.data)
    .filter((part) => part.type === "tool")
    .map((part) => ({
      tool: part.tool,
      status: part.state?.status,
      input: part.input ?? part.state?.input ?? null,
      title: part.title ?? null,
    }))
}

function scoreRun(testCase, parsed, markdown, runData, review, compare) {
  const imagePrompts = Array.isArray(parsed?.image_prompts) ? parsed.image_prompts : []
  const legacyText = JSON.stringify(parsed?.video_prompt?.legacy_json ?? {})
  const finalArtifactText = [
    JSON.stringify(imagePrompts),
    markdown,
    legacyText,
  ].join("\n")
  const forbiddenCheckText = [
    JSON.stringify(imagePrompts),
    stripForbiddenSections(markdown),
    stripForbiddenSections(legacyText),
  ].join("\n")
  const filesRead = Array.isArray(parsed?.files_read) ? parsed.files_read : []
  const calls = toolCalls(runData.parts ?? [])
  const readIncludes = (...needles) => filesRead.some((file) => needles.some((needle) => file.includes(needle)))

  const requiredProcess = [
    filesRead.some((file) => file.includes(`ep_${testCase.episode}.json`)),
    readIncludes("character-dna", "character-reference-policy"),
    readIncludes("seedance-lessons", "seedance-core-lessons"),
    readIncludes("director-playbook", "director-playbook-core"),
    imagePrompts.length >= 3,
    Boolean(markdown.includes("shot_function") && markdown.includes("prev_shot_recap") && markdown.includes("next_shot_setup")),
    Boolean(parsed?.self_review),
  ]
  const bannedRead = filesRead.some(
    (file) => file.includes("ablation") || file.includes("authority-prompt-template") || file.includes("/episodes/"),
  )
  const mediaToolIDs = new Set([
    "generate-image-nanobanana",
    "generate-image-gpt",
    "generate-video-seedance",
    "generate-video-happyhorse",
    "concat-clips",
    "crop-video",
  ])
  const bannedTool = calls.some((call) => {
    if (mediaToolIDs.has(call.tool)) return true
    if (call.tool === "skill") return true
    if (call.tool !== "bash") return false
    const payload = JSON.stringify(call.input ?? {})
    return /videoctl\s+(upload|submit|run-shot|download|extract)|curl|wget|generate\.py/.test(payload)
  })
  const behaviorScore = Math.max(
    0,
    Math.round((requiredProcess.filter(Boolean).length / requiredProcess.length) * 100) -
      (bannedRead ? 40 : 0) -
      (bannedTool ? 60 : 0),
  )

  const expectedHit = hasAny(finalArtifactText, testCase.expectedPhrases)
  const forbiddenHit = hasAny(forbiddenCheckText, testCase.forbiddenPhrases)
  const charactersHit = testCase.expectedCharacters.filter((c) => finalArtifactText.includes(c))
  const sceneHit =
    finalArtifactText.includes(testCase.expectedScene.split(" ").at(-1) ?? testCase.expectedScene) ||
    finalArtifactText.includes(testCase.expectedScene)
  const imageTypes = new Set(imagePrompts.map((p) => p.type))
  const imageScore = Math.min(100, imagePrompts.length * 15 + (imageTypes.has("scene") ? 20 : 0) + (imageTypes.has("costume") ? 20 : 0))
  const reviewScore = typeof review?.score === "number" ? review.score : 0
  const compareScore = typeof compare?.score === "number" ? compare.score : 0
  const scriptScore = Math.max(
    0,
    Math.round(
      (expectedHit.length / testCase.expectedPhrases.length) * 40 +
        (charactersHit.length / testCase.expectedCharacters.length) * 25 +
        (sceneHit ? 15 : 0) +
        (forbiddenHit.length === 0 ? 20 : 0),
    ),
  )
  const consistencyScore = Math.round(
    Math.min(100, (imageScore * 0.35 + scriptScore * 0.45 + reviewScore * 0.2)),
  )
  const finalScore = Math.round(scriptScore * 0.35 + consistencyScore * 0.25 + reviewScore * 0.2 + compareScore * 0.2)

  return {
    behaviorScore,
    finalScore,
    consistencyScore,
    scriptScore,
    imageScore,
    reviewScore,
    compareScore,
    expectedHit,
    forbiddenHit,
    charactersHit,
    sceneHit,
    bannedRead,
    bannedTool,
    toolCalls: calls,
  }
}

function summarize(runs) {
  const groups = new Map()
  for (const run of runs) {
    const key = `${run.side}::${run.case_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(run)
  }
  const rows = []
  for (const [key, values] of groups) {
    const [side, caseID] = key.split("::")
    const mean = (field) => {
      const nums = values.map((v) => v[field]).filter((x) => typeof x === "number" && Number.isFinite(x))
      return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null
    }
    rows.push({
      side,
      case_id: caseID,
      runs: values.length,
      failures: values.filter((v) => v.status !== "ok").length,
      elapsedMsMean: mean("elapsedMs"),
      totalTokensMean: mean("totalTokens"),
      costUsdMean: mean("costUsd"),
      behaviorScoreMean: mean("behaviorScore"),
      finalScoreMean: mean("finalScore"),
      consistencyScoreMean: mean("consistencyScore"),
      reviewScoreMean: mean("reviewScore"),
      compareScoreMean: mean("compareScore"),
    })
  }
  return rows.sort((a, b) => `${a.case_id}${a.side}`.localeCompare(`${b.case_id}${b.side}`))
}

function markdownReport(runId, args, rows, runs) {
  const lines = [
    `# Phase 7 Real Agent AB Report`,
    "",
    `run_id: ${runId}`,
    `model: ${args.model}`,
    `reps: ${args.reps}`,
    `sides: ${args.sides.join(", ")}`,
    "",
    "No image or video generation was invoked. This report evaluates prompt generation only.",
    "",
    "## Aggregate",
    "",
    "| side | case | runs | failures | elapsed_ms | tokens | cost_usd | behavior | consistency | review | gold_compare | final |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ]
  for (const row of rows) {
    lines.push(
      `| ${row.side} | ${row.case_id} | ${row.runs} | ${row.failures} | ${row.elapsedMsMean ?? ""} | ${
        row.totalTokensMean ?? ""
      } | ${row.costUsdMean ?? ""} | ${row.behaviorScoreMean ?? ""} | ${row.consistencyScoreMean ?? ""} | ${
        row.reviewScoreMean ?? ""
      } | ${row.compareScoreMean ?? ""} | ${row.finalScoreMean ?? ""} |`,
    )
  }

  lines.push("", "## Run Notes", "")
  for (const run of runs) {
    lines.push(
      `- ${run.side} / ${run.case_id} / rep ${run.rep}: status=${run.status}, elapsed=${run.elapsedMs}ms, tokens=${
        run.totalTokens ?? "n/a"
      }, behavior=${run.behaviorScore ?? "n/a"}, final=${run.finalScore ?? "n/a"}, output=${run.outputDir}`,
    )
    if (run.parseError) lines.push(`  parse_error: ${run.parseError}`)
  }
  lines.push("")
  return lines.join("\n")
}

function parseSavedCommand(path) {
  if (!existsSync(path)) return null
  return maybeParseCommandJSON(readJSON(path))
}

function readJSONIfExists(path, fallback = null) {
  if (!existsSync(path)) return fallback
  return readJSON(path)
}

function reevaluateRun(runId) {
  const runRoot = join(ROOT, ".artifacts/phase7-real-agent-ab", runId)
  const config = readJSON(join(runRoot, "run-config.json"))
  const selectedCases = (readJSONIfExists(join(runRoot, "case-manifest.json"), []) ?? [])
    .map((item) => CASES.find((testCase) => testCase.id === item.id) ?? item)
    .filter(Boolean)
  const runs = []

  for (const testCase of selectedCases) {
    for (let rep = 1; rep <= config.reps; rep++) {
      for (const side of config.sides) {
        const outDir = join(runRoot, "runs", side, testCase.id, `rep-${rep}`)
        const parsedResult = readJSONIfExists(join(outDir, "parsed-result.json"), {})
        const parsed = parsedResult.value ?? null
        const markdown = readTextOptional(join(outDir, "video-prompt.md")).value ?? markdownFromResult(parsed)
        const review = parseSavedCommand(join(outDir, "review-command.json"))
        const compare = parseSavedCommand(join(outDir, "compare-command.json"))
        const traceParts = readJSONIfExists(join(outDir, "trace-parts.json"), [])
        const processInfo = readJSONIfExists(join(outDir, "process.json"), {})
        const opencodeInfo = readJSONIfExists(join(outDir, "opencode-message.json"), {})
        const tokens = opencodeInfo.tokenTotals ?? null
        const score = scoreRun(testCase, parsed, markdown, { parts: traceParts }, review, compare)

        writeJSON(join(outDir, "evaluation.json"), score)

        const record = {
          status: parsedResult.ok ? "ok" : "failed",
          side,
          case_id: testCase.id,
          rep,
          outputDir: outDir,
          workspace: processInfo.command?.[processInfo.command.indexOf("--dir") + 1] ?? null,
          elapsedMs: processInfo.elapsedMs ?? null,
          assistantMessageCount: opencodeInfo.assistantMessages?.length ?? null,
          totalTokens: tokens?.total ?? null,
          inputTokens: tokens?.input ?? null,
          outputTokens: tokens?.output ?? null,
          reasoningTokens: tokens?.reasoning ?? null,
          cacheWriteTokens: tokens?.cacheWrite ?? null,
          cacheReadTokens: tokens?.cacheRead ?? null,
          costUsd: tokens?.cost ?? null,
          parseError: parsedResult.error ?? null,
          ...score,
        }
        runs.push(record)
        writeJSON(join(outDir, "run-record.json"), record)
      }
    }
  }

  const rows = summarize(runs)
  const reportArgs = { ...config, reevaluated: true }
  writeJSON(join(runRoot, "summary.json"), { rows, runs, reevaluatedAt: new Date().toISOString() })
  writeFileSync(join(runRoot, "REPORT.md"), markdownReport(runId, reportArgs, rows, runs))
  console.log(JSON.stringify({ runRoot, rows }, null, 2))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.reevaluate) {
    reevaluateRun(args.reevaluate)
    return
  }
  const selectedCases = CASES.filter((c) => args.cases.includes(c.id))
  if (selectedCases.length === 0) throw new Error("No cases selected")
  const runRoot = join(ROOT, ".artifacts/phase7-real-agent-ab", args.runId)
  const workspaceRoot = join("/tmp/assets-produce-phase7-real-agent-ab", args.runId)
  if (args.clean) {
    rmSync(runRoot, { recursive: true, force: true })
    rmSync(workspaceRoot, { recursive: true, force: true })
  }
  ensureDir(runRoot)
  ensureDir(workspaceRoot)
  writeJSON(join(runRoot, "case-manifest.json"), selectedCases)
  writeJSON(join(runRoot, "run-config.json"), { ...args, workspaceRoot })

  const runs = []
  for (const testCase of selectedCases) {
    for (let rep = 1; rep <= args.reps; rep++) {
      for (const side of args.sides) {
        const outDir = join(runRoot, "runs", side, testCase.id, `rep-${rep}`)
        ensureDir(outDir)
        const workspace = prepareWorkspace(workspaceRoot, side, testCase, rep)
        const prompt = buildTaskPrompt(side, testCase, workspace)
        writeFileSync(join(outDir, "task-prompt.txt"), prompt)

        console.error(`[phase7-ab] ${side} ${testCase.id} rep ${rep} start`)
        const runData = runOpencode({ side, workspace, prompt, outDir, model: args.model })
        copyAgentOutput(workspace, outDir)
        const parsedResult = readAgentArtifacts(workspace, runData.assistantText)
        writeJSON(join(outDir, "parsed-result.json"), {
          ok: parsedResult.ok,
          error: parsedResult.error,
          value: parsedResult.value,
          fallback: parsedResult.fallback,
        })

        const markdown = markdownFromResult(parsedResult.value)
        writeFileSync(join(outDir, "video-prompt.md"), markdown)
        const gold = sectionGold(testCase)
        writeFileSync(join(outDir, "gold-prompt.md"), gold)

        const reviewResult = markdown
          ? runCLI(["video", "prompt", "review", join(outDir, "video-prompt.md"), "--json"], join(outDir, "review-command.json"))
          : null
        const compareResult =
          markdown && gold
            ? runCLI(
                ["video", "prompt", "compare", join(outDir, "video-prompt.md"), join(outDir, "gold-prompt.md"), "--json"],
                join(outDir, "compare-command.json"),
              )
            : null

        const review = reviewResult ? maybeParseCommandJSON(reviewResult) : null
        const compare = compareResult ? maybeParseCommandJSON(compareResult) : null
        const score = scoreRun(testCase, parsedResult.value, markdown, runData, review, compare)
        writeJSON(join(outDir, "evaluation.json"), score)

        const tokens = runData.tokenTotals ?? null
        const record = {
          status: parsedResult.ok ? "ok" : "failed",
          side,
          case_id: testCase.id,
          rep,
          outputDir: outDir,
          workspace,
          elapsedMs: runData.elapsedMs,
          assistantMessageCount: runData.assistantMessages?.length ?? null,
          totalTokens: tokens?.total ?? null,
          inputTokens: tokens?.input ?? null,
          outputTokens: tokens?.output ?? null,
          reasoningTokens: tokens?.reasoning ?? null,
          cacheWriteTokens: tokens?.cacheWrite ?? null,
          cacheReadTokens: tokens?.cacheRead ?? null,
          costUsd: tokens?.cost ?? null,
          parseError: parsedResult.error,
          ...score,
        }
        runs.push(record)
        writeJSON(join(outDir, "run-record.json"), record)
        console.error(`[phase7-ab] ${side} ${testCase.id} rep ${rep} done final=${record.finalScore}`)
      }
    }
  }

  const rows = summarize(runs)
  writeJSON(join(runRoot, "summary.json"), { rows, runs })
  writeFileSync(join(runRoot, "REPORT.md"), markdownReport(args.runId, args, rows, runs))
  console.log(JSON.stringify({ runRoot, rows }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
