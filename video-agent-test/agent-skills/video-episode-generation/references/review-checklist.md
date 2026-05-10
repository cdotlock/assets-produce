# Skill Reviewer — 技能文件质量检测标准

运行时机：**写新 prompt 前 / 修改任一 skill 文件后 / 翻车复盘时**。
逐项打 ✅/❌ — 任何 ❌ 立即修改对应文件，修改后重跑该文件全部检测项，确认全过再继续。

---

## WORKFLOW.md（10 项，必须全过）

| # | 检测项 | 通过标准 |
|---|---|---|
| W1 | Step 1 是否强制读剧本 | 有"P0：写 prompt 前必须 Read ep_X.json"或等效措辞 |
| W2 | 情绪定位三行是否强制 | `shot_function` / `prev_shot_recap` / `next_shot_setup` 三个字段都被列为必填 |
| W3 | 无废弃脚本引用 | 文件内没有旧视频 Python 脚本（`upload_to_oss.py` / `validate_urls.py` / `build_gateway_payload.py` / `download_video.py` / `extract_end_frame.py` / `extract_frame_candidates.py` / `select_spatial_frame.py`）或 `gen_ref_video.py` 的任何路径或调用 |
| W4 | 情绪误读失败模式存在 | 有"shot_1b v3-v5.1 翻车"或"引信≠爆破"的具体案例 |
| W5 | SOP 步骤数合理 | 7-9 步（过少 = 缺流程，过多 = 已有重叠） |
| W6 | 两种运行模式都存在 | 有 interactive 和 pipeline 两节 |
| W7 | 内部网关连续性 SOP | 有 `sourceVideoUrls` + `referenceImageUrls` + 末帧图承接 + 生成前素材必须上传 OSS |
| W8 | Step 5.5 Prompt Review 存在且完整 | 有 7 组（Reference完整性 / 空间连贯性 / 剧情理解 / 人物心理 / 情绪强度校准 / 镜头语言匹配 / 技术合规），每组有具体可打勾条目；且明确标注由**独立 Review Agent 执行**，并列出 agent 必须读取的文件清单 |
| W9 | videoctl 唯一执行入口 | 明确写出 `scripts/bin/videoctl` 是唯一视频任务执行入口；生成用 `scripts/bin/videoctl submit <prompt.md> --wait` 或 `run-shot`；禁止手写 `curl` / `requests.post` 直连内部网关 |
| W10 | videoctl 使用前参考文档 | 明确要求本轮第一次使用 videoctl 前 Read `scripts/videoctl/AGENT_REFERENCE.md`，且该文件存在并覆盖命令选择、标准生成链路、run 目录和失败处理 |

**❌ 修复方向**：W1/W2 缺失 → 在 SOP 最顶部追加强制段落；W3 出现 → 全文删除；W4 缺失 → 补入失败模式章节；W5/W6 缺失 → 拆分或合并对应步骤；W7 缺失 → 补内部网关连续性参数；W8 缺失 → 在 Step 5 和 Step 6 之间补入 Step 5.5 全文；W9 缺失 → 在 SOP 顶部补 videoctl 执行入口段；W10 缺失 → 增加 `scripts/videoctl/AGENT_REFERENCE.md` 并在 SKILL P0 段强制读取。

---

## SEEDANCE_LESSONS.md（8 项，必须全过）

| # | 检测项 | 通过标准 |
|---|---|---|
| L1 | 能力三档表格完整 | 强档≥20cm / 中档5-20cm / 弱档≤5cm 三行都存在，且有稳定性百分比 |
| L2 | 反向校准公式明确 | 有"prompt 写的强度 = 目标 × 2"或等效公式 |
| L3 | 道具激活时间点铁律 | 有"银手链 forbidden_before_activation: shot_5"或等效案例 |
| L4 | 情绪定位铁律 | 有"本镜情绪取决于下一镜，不取决于本镜对白本身"或等效 |
| L5 | 每条 Lesson 有具体翻车佐证 | 每条至少标注一个真实 shot_id + 版本号（如 `shot_1b_v3`）作为反例 |
| L6 | 无通用 AI 写作建议 | 没有"保持风格一致""注意细节""确保连贯"等废话，每条都 Seedance 专属 |
| L7 | TTS 语气写法存在 | 有"TTS 响应句式结构，不响应语气形容词"原则 + 至少 4 种情绪状态的对应句式模板 |
| L8 | 表情丰富度写法边界存在 | 有表情档位稳定性表格 + "弱档表情必须配强档身体动作"铁律 + 配对示例 |
| L9 | 空间参考帧双帧分工存在 | 有 `_end.png`（时间承接）vs `_spatial.png`（空间参考）的分工说明 + 选取原则 + L3/L4 强制执行标注 + 写 prompt 前必须看图的铁律 |

**❌ 修复方向**：L1 缺档位 → 补表格行；L2 无公式 → 提炼公式段；L3/L4 缺失 → 追加独立 Lesson；L5 佐证模糊 → 补 shot_id+版本号；L6 出现废话 → 删除对应句子；L7 缺失 → 补 #10 节；L8 缺失 → 补 #11 节；L9 缺失 → 补 #12 节。

---

## DIRECTOR_PLAYBOOK.md（6 项，必须全过）

| # | 检测项 | 通过标准 |
|---|---|---|
| D1 | 弃用清单已删 | 文件内没有"弃用清单"标题或"禁止用词"列表（已全部删除） |
| D2 | 所有推荐技巧 Seedance 可执行 | 没有把虹膜/皮下肌肉/光圈收缩/伦勃朗打光 等弱档技巧当强档推荐 |
| D3 | 工业欺骗公式四要素齐全 | 主体静止 + 背景动态模糊 + 头发/衣料微动 + 侧向光斑——四项都在 |
| D4 | 三重静止有技术理由 | 有"防末段抽帧/瞬移"等技术说明（不能只说是"审美选择"） |
| D5 | 景别阶梯有禁止项 | 独白镜头明确标注"禁止跳级直接给特写" |
| D6 | 第 9-11 条镜头角度内容存在 | 有角度情绪速查表（含 7 种角度）、人物出场三模式、对话两技巧；且第 9-11 条标注为"待验证"与第 1-8 条区分 |

**❌ 修复方向**：D1 有残留 → 全文检索"弃用"并删除；D2 出现弱档技巧被推荐 → 移到 SEEDANCE_LESSONS 弱档说明；D3 缺要素 → 补入工业欺骗公式；D4 无技术理由 → 追加括号说明；D5 缺禁止项 → 在景别阶梯表格补"禁止"列；D6 缺失 → 补入三节（第 9/10/11 条）并标注"待验证"。

---

## SHOT_ID_POLICY.md（5 项，必须全过）

| # | 检测项 | 通过标准 |
|---|---|---|
| S1 | @图N ↔ assets.images 顺序铁律存在 | 有"顺序错位会导致场景图当立绘用"等价警告 |
| S2 | 动态承接字段明确 | 有 `sourceVideoUrls` 和 `referenceImageUrls`，不允许歧义；所有素材字段要求 OSS URL |
| S3 | 末帧 PNG 标准路径存在 | `{作品}/episodes/ep_{N}/end-frames/{shot_id}_end.png` 格式在文中可见 |
| S4 | 无 gen_ref_video.py 引用 | 文件内没有该脚本路径 |
| S5 | 严禁项清单有效 | 有跳号/重复/中文字符/空格中至少三条 |

**❌ 修复方向**：S1 缺警告 → 在@图N段落追加；S2/S3 缺失 → 在素材引用章节补条目；S4 出现 → 删除；S5 不足三条 → 补全四条。

---

## CHARACTER_DNA.md（4 项，必须全过）

| # | 检测项 | 通过标准 |
|---|---|---|
| C1 | 无弱档属性被列为锁定 | 没有色温/光温（3200K/5600K）/焦段（50mm）/灯型（伦勃朗）作为 DNA 锁定项 |
| C2 | 服装权威源指向剧本 | 有"服装权威源是 `ep_X.json::character_outfits`"或等效 |
| C3 | 立绘文件映射表完整 | Sylvia（日常/墓地两版）、James、Kennedy 四条路径都存在 |
| C4 | 无招牌动作/禁用动作锁定 | 没有把"摸手链""左手触碰配饰"等剧情触发动作列为固定 DNA |

**❌ 修复方向**：C1 出现弱档锁 → 删除并加注"Seedance 弱档不响应靠参考图"；C2 缺失 → 顶部追加权威源说明；C3 缺路径 → 补全映射表行；C4 出现招牌动作 → 删除并移到 SEEDANCE_LESSONS #3 道具激活章节。

---

## 汇总

| 文件 | 检测项数 |
|---|---|
| WORKFLOW.md | 10 |
| SEEDANCE_LESSONS.md | 9 |
| DIRECTOR_PLAYBOOK.md | 6 |
| SHOT_ID_POLICY.md | 5 |
| CHARACTER_DNA.md | 4 |
| **合计** | **34** |

**全部 34 项 ✅ → skills 达标，可以开始写 prompt。**
任何 1 项 ❌ → 修改 → 重跑该文件的所有检测项 → 再次确认全过。

---

## 执行频率

| 触发时机 | 需要跑的检测 |
|---|---|
| 新 episode 首次开工 | 全部 34 项 |
| 修改了某个 skill 文件 | 该文件对应的全部检测项 |
| 翻车后复盘 | 全部 34 项（找出哪条漏检）|
| 新增 Lesson 到任意 skill | 该文件对应的全部检测项 |
