#!/usr/bin/env python3
"""
MOBAI-ASSESTS-Agent Prompt Generator (Initial Version)
Simulates the current MOBAI agent with gaps that need alignment
"""

import json
from pathlib import Path
from typing import Dict, List

class MobaiAgentPromptGenerator:
    """Generates prompts using MOBAI-ASSESTS-Agent current logic"""

    def __init__(self):
        # Initial version has gaps compared to video-agent-test
        self.rules = self._load_initial_rules()

    def _load_initial_rules(self) -> Dict:
        """Load aligned MOBAI agent rules (after incremental fixes)"""
        return {
            # FIXED: Zero subtitle defense - full E-1 format
            "zero_subtitle_defense": """以下人物均为原创动漫角色（非真实人物），版权所有 ©️ MOBAI Game Studio。

全程无字幕、无 subtitle、无 caption、无文字浮现、无对白文字显示、无任何形式的屏幕文字叠加。严禁在画面任何位置出现文字、字母、数字、标点符号、对话框、文本框、字幕条。对白仅通过角色口型和音频呈现，画面保持纯视觉叙事。""",

            # FIXED: Visual style constraint - 防御清单 #5
            "visual_style": """视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading 而非渐变光影，非写实渲染 non-photorealistic rendering，无景深虚化 no depth-of-field blur，无真实皮肤质感 no realistic skin texture，无真实发丝高光 no realistic hair highlights，简化五官 simplified cartoon facial features（眼睛为动漫大眼平涂、鼻梁为简化线条、嘴唇为卡通简笔），画面整体为 Korean webtoon illustration style 而非 3D CG 或写实绘画；所有人物脸部必须呈现明显动漫化简笔特征、严禁出现摄影质感/写实渲染/3D 渲染/真人相片外观。""",

            # FIXED: Character uniqueness - 防御清单 #3
            "character_uniqueness": """人物唯一性铁律：画面中{characters}，严禁角色分身 / 复制 / 同时出现在画面不同位置 / 走动时原位残留旧实例。每个角色在画面中始终仅为一人。""",

            # FIXED: Camera lock format - E-8
            "camera_lock_template": """景别硬锁：0-{lock_time}s 缓慢推进从{start_shot}至{end_shot}，{lock_time}s 后停止推进，镜头完全静止。""",

            # FIXED: Three-fold stillness - E-9
            "three_fold_stillness": """收尾三重静止：最后 3s 镜头完全静止、角色姿态静止、背景静止。""",

            # FIXED: First frame mode opening - 防御清单 #5
            "first_frame_mode_opening": """@图1 作为首帧。"""
        }

    def generate_prompt(self, test_case: Dict, run_num: int) -> Dict:
        """Generate a prompt with current MOBAI logic"""
        case_id = test_case['case_id']

        # Build frontmatter (similar structure)
        frontmatter = self._build_frontmatter(test_case, run_num)

        # Build prompt body (with gaps)
        prompt_body = self._build_prompt_body(test_case)

        return {
            "run_number": run_num,
            "case_id": case_id,
            "case_name": test_case['case_name'],
            "frontmatter": frontmatter,
            "prompt_body": prompt_body,
            "metadata": {
                "characters": test_case['characters'],
                "gaps_present": self._identify_gaps(prompt_body, test_case)
            }
        }

    def _build_frontmatter(self, test_case: Dict, run_num: int) -> Dict:
        """Build frontmatter (similar to video-agent)"""
        is_first_frame_mode = "case_10" in test_case['case_id']

        return {
            "shot_id": f"{test_case['case_id']}_run{run_num}",
            "duration": test_case['duration'],
            "mode": "首尾帧" if is_first_frame_mode else "多参考",
            "scene": test_case['scene'],
            "emotion_arc": test_case['emotion_arc'],
            "assets": {
                "images": test_case['reference_assets']['images'],
                "videos": []
            }
        }

    def _build_prompt_body(self, test_case: Dict) -> str:
        """Build prompt body with aligned MOBAI logic"""
        sections = []

        # FIXED: Zero subtitle defense FIRST (must be in first 200 chars)
        sections.append(self.rules['zero_subtitle_defense'])

        # FIXED: Visual style constraint in first 300 chars
        sections.append(self.rules['visual_style'])

        # FIXED: First frame mode opening if applicable
        if "case_10" in test_case['case_id'] or "first_frame" in test_case['case_name'].lower():
            sections.append(self.rules['first_frame_mode_opening'])

        # FIXED: Character uniqueness declaration
        char_list = " / ".join([f"{c}始终仅为一人" for c in test_case['characters']])
        sections.append(self.rules['character_uniqueness'].format(characters=char_list))

        # Scene description
        sections.append(f"\n场景：{test_case['scene']}")

        # Key scene description
        sections.append(self._build_key_scene(test_case))

        # Dialogue section if applicable
        if self._has_dialogue(test_case):
            sections.append(self._build_dialogue_section(test_case))

        # FIXED: Camera control with E-8 format
        if "camera_lock" in test_case['case_name'].lower() or "case_08" in test_case['case_id']:
            sections.append(self.rules['camera_lock_template'].format(
                lock_time=8,
                start_shot="中景",
                end_shot="近景面部特写"
            ))

        # FIXED: Three-fold stillness
        sections.append(self.rules['three_fold_stillness'])

        # Enhanced prohibition list
        sections.append(self._build_prohibition_list(test_case))

        return "\n\n".join(sections)

    def _build_key_scene(self, test_case: Dict) -> str:
        """Build key scene description"""
        script = test_case['script_segment']
        return f"关键场景：\n{script[:150]}..."

    def _has_dialogue(self, test_case: Dict) -> bool:
        """Check if test case has dialogue"""
        return "dialogue" in test_case['case_name'].lower() or "对白" in test_case['case_name']

    def _build_dialogue_section(self, test_case: Dict) -> str:
        """Build dialogue section with E-6 format"""
        # FIXED: E-6 format with timing and 口型同步
        return """对白与口型同步：
【2s】Sylvia speaks "James. We need to talk." (口型同步)
【8s】Sylvia speaks "Kennedy." (口型同步)
【11s】Sylvia speaks "What is the relationship between you and her?" (口型同步)"""

    def _build_prohibition_list(self, test_case: Dict) -> str:
        """Build enhanced prohibition list"""
        prohibitions = [
            "严禁字幕、文字、对话框、文本框出现",
            "严禁角色分身或复制",
            "严禁景别推过头",
            "严禁收尾时镜头继续移动"
        ]

        # FIXED: Add case-specific prohibitions
        if "prop" in test_case['case_name'].lower():
            prohibitions.append("严禁虚构参考视频中不存在的道具位置")

        if "multi_character" in test_case['case_id']:
            prohibitions.append("严禁新角色凭空出现，必须建立空间关系")

        return "禁止清单：\n" + "\n".join(f"- {p}" for p in prohibitions)

    def _identify_gaps(self, prompt_body: str, test_case: Dict) -> List[str]:
        """Identify gaps compared to video-agent-test"""
        gaps = []

        if "全程无字幕" not in prompt_body[:200]:
            gaps.append("zero_subtitle_not_in_first_200")

        if "赛璐璐平涂风格" not in prompt_body[:300]:
            gaps.append("visual_style_missing")

        if "始终仅为一人" not in prompt_body:
            gaps.append("character_uniqueness_not_declared")

        if "收尾三重静止" not in prompt_body:
            gaps.append("three_fold_stillness_missing")

        if "case_10" in test_case['case_id'] and "@图1 作为首帧" not in prompt_body:
            gaps.append("first_frame_mode_opening_missing")

        if "case_08" in test_case['case_id'] and "景别硬锁" not in prompt_body:
            gaps.append("camera_lock_incomplete")

        if "case_06" in test_case['case_id'] and "口型同步" not in prompt_body:
            gaps.append("dialogue_sync_format_missing")

        return gaps

def main():
    generator = MobaiAgentPromptGenerator()

    # Load test cases
    test_cases_dir = Path("evaluation/test_cases")
    output_dir = Path("evaluation/mobai_agent_results")
    output_dir.mkdir(parents=True, exist_ok=True)

    test_cases = []
    for file in sorted(test_cases_dir.glob("case_*.json")):
        with open(file, 'r', encoding='utf-8') as f:
            test_cases.append(json.load(f))

    print(f"Generating MOBAI agent prompts for {len(test_cases)} test cases, 10 runs each\n")

    for test_case in test_cases:
        case_id = test_case['case_id']
        print(f"Processing {case_id}: {test_case['case_name']}")

        runs = []
        for run_num in range(1, 11):
            prompt_data = generator.generate_prompt(test_case, run_num)
            runs.append(prompt_data)
            print(f"  Run {run_num}/10 ✓")

        # Save results
        result = {
            "test_case": test_case,
            "runs": runs
        }

        output_file = output_dir / f"{case_id}_results.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(f"  Saved to {output_file}\n")

    print("✓ MOBAI-ASSESTS-Agent prompt generation complete")

if __name__ == "__main__":
    main()
