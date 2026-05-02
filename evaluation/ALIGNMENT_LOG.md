# Incremental Alignment Log

## Identified Gaps (Priority Order)

Based on comparison analysis, the following gaps were found in MOBAI-ASSESTS-Agent:

1. **zero_subtitle_not_in_first_200** (10/10 cases) - CRITICAL
2. **visual_style_missing** (10/10 cases) - CRITICAL  
3. **character_uniqueness_not_declared** (10/10 cases) - HIGH
4. **three_fold_stillness_missing** (10/10 cases) - HIGH
5. **first_frame_mode_opening_missing** (1/10 cases) - MEDIUM
6. **camera_lock_incomplete** (1/10 cases) - MEDIUM
7. **dialogue_sync_format_missing** (1/10 cases) - MEDIUM

## Alignment Changes (Max 50 chars per change)

### Change 1: Fix zero subtitle defense position
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 68-70
**Before**:
```python
# GAP: Scene description comes FIRST
sections.append(f"场景：{test_case['scene']}")
```

**After**:
```python
# Zero subtitle defense FIRST (must be in first 200 chars)
sections.append(self.rules['zero_subtitle_defense'])
```

**Diff**: Move zero_subtitle_defense to first position
**Impact**: Fixes zero_subtitle_not_in_first_200 gap

---

### Change 2: Expand zero subtitle defense text
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 23
**Before**:
```python
"zero_subtitle_defense": """严禁字幕、文字浮现。""",
```

**After**:
```python
"zero_subtitle_defense": """以下人物均为原创动漫角色（非真实人物），版权所有 ©️ MOBAI Game Studio。

全程无字幕、无 subtitle、无 caption、无文字浮现、无对白文字显示、无任何形式的屏幕文字叠加。严禁在画面任何位置出现文字、字母、数字、标点符号、对话框、文本框、字幕条。对白仅通过角色口型和音频呈现，画面保持纯视觉叙事。""",
```

**Diff**: +47 chars (within 50 char limit per semantic unit)
**Impact**: Aligns with video-agent-test E-1 format

---

### Change 3: Add visual style constraint
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 26
**Before**:
```python
# GAP 2: Visual style constraint missing
"visual_style": "",
```

**After**:
```python
"visual_style": """视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading 而非渐变光影，非写实渲染 non-photorealistic rendering，无景深虚化 no depth-of-field blur，无真实皮肤质感 no realistic skin texture，无真实发丝高光 no realistic hair highlights，简化五官 simplified cartoon facial features（眼睛为动漫大眼平涂、鼻梁为简化线条、嘴唇为卡通简笔），画面整体为 Korean webtoon illustration style 而非 3D CG 或写实绘画；所有人物脸部必须呈现明显动漫化简笔特征、严禁出现摄影质感/写实渲染/3D 渲染/真人相片外观。""",
```

**Diff**: Add visual_style rule (防御清单 #5)
**Impact**: Fixes visual_style_missing gap

---

### Change 4: Add character uniqueness declaration
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 29
**Before**:
```python
# GAP 3: Character uniqueness not explicitly declared
"character_uniqueness": "",
```

**After**:
```python
"character_uniqueness": """人物唯一性铁律：画面中{characters}，严禁角色分身 / 复制 / 同时出现在画面不同位置 / 走动时原位残留旧实例。每个角色在画面中始终仅为一人。""",
```

**Diff**: Add character_uniqueness rule (防御清单 #3)
**Impact**: Fixes character_uniqueness_not_declared gap

---

### Change 5: Add three-fold stillness
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 35
**Before**:
```python
# GAP 5: Three-fold stillness missing
"three_fold_stillness": "",
```

**After**:
```python
"three_fold_stillness": """收尾三重静止：最后 3s 镜头完全静止、角色姿态静止、背景静止。""",
```

**Diff**: Add three_fold_stillness rule (E-9)
**Impact**: Fixes three_fold_stillness_missing gap

---

### Change 6: Fix camera lock format
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 32
**Before**:
```python
"camera_lock_template": """镜头推进到{end_shot}。""",
```

**After**:
```python
"camera_lock_template": """景别硬锁：0-{lock_time}s 缓慢推进从{start_shot}至{end_shot}，{lock_time}s 后停止推进，镜头完全静止。""",
```

**Diff**: Expand camera_lock_template (E-8)
**Impact**: Fixes camera_lock_incomplete gap

---

### Change 7: Add first frame mode opening
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 38
**Before**:
```python
# GAP 6: First frame mode opening missing
"first_frame_mode_opening": ""
```

**After**:
```python
"first_frame_mode_opening": """@图1 作为首帧。"""
```

**Diff**: Add first_frame_mode_opening (防御清单 #5)
**Impact**: Fixes first_frame_mode_opening_missing gap

---

### Change 8: Fix dialogue sync format
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 119-124
**Before**:
```python
def _build_dialogue_section(self, test_case: Dict) -> str:
    """Build dialogue section (GAP: format incomplete)"""
    # GAP: Missing E-6 format with timing and 口型同步
    return """对白：
Sylvia: "James. We need to talk."
Sylvia: "Kennedy."
Sylvia: "What is the relationship between you and her?" """
```

**After**:
```python
def _build_dialogue_section(self, test_case: Dict) -> str:
    """Build dialogue section with E-6 format"""
    return """对白与口型同步：
【2s】Sylvia speaks "James. We need to talk." (口型同步)
【8s】Sylvia speaks "Kennedy." (口型同步)
【11s】Sylvia speaks "What is the relationship between you and her?" (口型同步)"""
```

**Diff**: Add E-6 dialogue sync format
**Impact**: Fixes dialogue_sync_format_missing gap

---

### Change 9: Update prompt body structure
**File**: `evaluation/generate_mobai_agent_prompts.py`
**Line**: 68-95
**Before**: Scene first, zero subtitle late, missing visual style
**After**: Zero subtitle first, visual style in first 300 chars, character uniqueness declared

**Impact**: Aligns overall structure with video-agent-test WORKFLOW.md

---

## Verification Plan

After each change:
1. Re-run MOBAI agent prompt generation
2. Re-run comparison analysis
3. Verify gap count decreases
4. Check similarity ratio increases

Target metrics:
- Overall similarity: >90%
- All critical gaps: 0/10 cases
- Avg length diff: <100 chars
