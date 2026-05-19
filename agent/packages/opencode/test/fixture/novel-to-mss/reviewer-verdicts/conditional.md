# Bible Review Report — demo-book

## 产物路径
- 审查目标:`moonscripts/demo-book/02-character-architect/`
- 文件清单: mc-bible.md, li-bible-01-mauricio.md, li-bible-02-dorian.md, decision-log.md

## Step 1 Evidence Trail 抽查
- 全部 Evidence claim 数:48
- 抽查数量 K:48 (全扫,不抽样)
- 命中数:48 (100 %),含 2 条 ⚠ 修正项
- 判定:CONDITIONAL

### 抽查明细
| # | LI | Claim | 原文 Grep 结果 | 判定 |
|---|----|-------|---------------|------|
| 1 | Mauricio | Ch25(蝴蝶手链)"I love how you're still wearing this" | 在 ch25.txt 内命中 | PASS |
| 2 | Dorian | Ch12 钢琴独奏 "他第一次主动开口" | 命中但措辞与原文略偏 | ⚠ |

## Step 2 LI 数量决策日志审查
- 检查 A 候选逐项:CONDITIONAL
- 检查 B LI 数量区间:PASS
- 检查 C 画像 gap:PASS
- 检查 D 新增 LI 标注:N-A

## Step 3 B 层深度检查(按 LI 列)

### LI-1: Mauricio
- B1 好感度专属性:PASS
- B2 回调事件完整性:CONDITIONAL
- B3 调性可区分性:PASS

### LI-2: Dorian
- B1 好感度专属性:PASS
- B2 回调事件完整性:PASS
- B3 调性可区分性:PASS

## Step 4 跨 LI 同场景分化
- 共用场景列表:开学典礼、雨夜便利店、期末舞会
- 分化评估矩阵:Mauricio×Dorian 分化度达标
- 判定:PASS

## Step 5 MC Voice 一致性
- 判定:PASS

---

## 总结论

CONDITIONAL

### 如 CONDITIONAL / FAIL
列出必须修改的条目(供 character-architect 直接 Edit):

- file: li-bible-02-dorian.md
  field: B2 PIANO_SOLO 回调
  problem: "Ch12 他主动开口 'I wrote this for someone'"
  suggest_edit: "Ch12 原文 Dorian 实际只是 'It's nothing.' —— 主动开放推迟到 Ch19。修正措辞后由 SAME bible-reviewer 复审"
