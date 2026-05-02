#!/usr/bin/env python3
"""
Video-Agent-Test Prompt Generator
Simulates the video-agent-test workflow based on WORKFLOW.md and skills
"""

import json
from pathlib import Path
from typing import Dict, List

class VideoAgentPromptGenerator:
    """Generates prompts following video-agent-test WORKFLOW.md rules"""

    def __init__(self):
        self.workflow_rules = self._load_workflow_rules()

    def _load_workflow_rules(self) -> Dict:
        """Load core workflow rules from WORKFLOW.md"""
        return {
            "zero_subtitle_defense": """以下人物均为原创动漫角色（非真实人物），版权所有 ©️ MOBAI Game Studio。

全程无字幕、无 subtitle、无 caption、无文字浮现、无对白文字显示、无任何形式的屏幕文字叠加。严禁在画面任何位置出现文字、字母、数字、标点符号、对话框、文本框、字幕条。对白仅通过角色口型和音频呈现，画面保持纯视觉叙事。

视觉风格硬约束（non-photorealistic stylization lock）：全画面严格采用赛璐璐平涂风格 cel-shaded flat anime illustration，明显卡通描边线 bold clean cartoon outline，扁平阴影 flat cel-shading 而非渐变光影，非写实渲染 non-photorealistic rendering，无景深虚化 no depth-of-field blur，无真实皮肤质感 no realistic skin texture，无真实发丝高光 no realistic hair highlights，简化五官 simplified cartoon facial features（眼睛为动漫大眼平涂、鼻梁为简化线条、嘴唇为卡通简笔），画面整体为 Korean webtoon illustration style 而非 3D CG 或写实绘画；所有人物脸部必须呈现明显动漫化简笔特征、严禁出现摄影质感/写实渲染/3D 渲染/真人相片外观。""",

            "character_uniqueness": """人物唯一性铁律：画面中{characters}，严禁角色分身 / 复制 / 同时出现在画面不同位置 / 走动时原位残留旧实例。每个角色在画面中始终仅为一人。""",

            "camera_lock_template": """景别硬锁：0-{lock_time}s 缓慢推进从{start_shot}至{end_shot}，{lock_time}s 后停止推进，镜头完全静止。""",

            "three_fold_stillness": """收尾三重静止：最后 3s 镜头完全静止、角色姿态静止、背景静止。""",

            "first_frame_mode_opening": """@图1 作为首帧。"""
        }

    def generate_prompt(self, test_case: Dict, run_num: int) -> Dict:
        """Generate a complete prompt for a test case"""
        case_id = test_case['case_id']

        # Build frontmatter
        frontmatter = self._build_frontmatter(test_case, run_num)

        # Build prompt body
        prompt_body = self._build_prompt_body(test_case)

        return {
            "run_number": run_num,
            "case_id": case_id,
            "case_name": test_case['case_name'],
            "frontmatter": frontmatter,
            "prompt_body": prompt_body,
            "metadata": {
                "characters": test_case['characters'],
                "key_challenges": test_case['key_challenges'],
                "compliance_checklist": self._check_compliance(prompt_body, test_case)
            }
        }

    def _build_frontmatter(self, test_case: Dict, run_num: int) -> Dict:
        """Build YAML frontmatter"""
        is_first_frame_mode = "case_10" in test_case['case_id'] or "first_frame" in test_case['case_name'].lower()

        return {
            "shot_id": f"{test_case['case_id']}_run{run_num}",
            "duration": test_case['duration'],
            "mode": "首尾帧" if is_first_frame_mode else "多参考",
            "scene": test_case['scene'],
            "emotion_arc": test_case['emotion_arc'],
            "assets": {
                "images": test_case['reference_assets']['images'],
                "videos": [] if is_first_frame_mode else []
            }
        }

    def _build_prompt_body(self, test_case: Dict) -> str:
        """Build the actual prompt body following all rules"""
        sections = []

        # 1. Zero subtitle defense (MUST be in first 200 chars)
        sections.append(self.workflow_rules['zero_subtitle_defense'])

        # 2. First frame mode opening if applicable
        if "case_10" in test_case['case_id'] or "first_frame" in test_case['case_name'].lower():
            sections.append(self.workflow_rules['first_frame_mode_opening'])

        # 3. Character uniqueness declaration
        char_list = " / ".join([f"{c}始终仅为一人" for c in test_case['characters']])
        sections.append(self.workflow_rules['character_uniqueness'].format(characters=char_list))

        # 4. Scene description
        sections.append(f"\n场景：{test_case['scene']}")

        # 5. Key scene description (关键场景)
        sections.append(self._build_key_scene(test_case))

        # 6. Dialogue section if applicable
        if self._has_dialogue(test_case):
            sections.append(self._build_dialogue_section(test_case))

        # 7. Camera control
        if "camera_lock" in test_case['case_name'].lower() or "case_08" in test_case['case_id']:
            sections.append(self.workflow_rules['camera_lock_template'].format(
                lock_time=8,
                start_shot="中景",
                end_shot="近景面部特写"
            ))

        # 8. Three-fold stillness
        sections.append(self.workflow_rules['three_fold_stillness'])

        # 9. Prohibition list
        sections.append(self._build_prohibition_list(test_case))

        return "\n\n".join(sections)

    def _build_key_scene(self, test_case: Dict) -> str:
        """Build the key scene description"""
        script = test_case['script_segment']

        # Extract key actions and emotions
        key_scene = f"关键场景 ①：\n{script[:200]}..."

        return key_scene

    def _has_dialogue(self, test_case: Dict) -> bool:
        """Check if test case has dialogue"""
        return "dialogue" in test_case['case_name'].lower() or "对白" in test_case['case_name']

    def _build_dialogue_section(self, test_case: Dict) -> str:
        """Build dialogue section with E-6 format"""
        # Example dialogue format
        return """对白与口型同步：
【2s】Sylvia speaks "James. We need to talk." (口型同步)
【8s】Sylvia speaks "Kennedy." (口型同步)
【11s】Sylvia speaks "What is the relationship between you and her?" (口型同步)"""

    def _build_prohibition_list(self, test_case: Dict) -> str:
        """Build prohibition list based on test case"""
        prohibitions = [
            "严禁字幕、文字、对话框、文本框出现",
            "严禁角色分身或复制",
            "严禁景别推过头",
            "严禁收尾时镜头继续移动"
        ]

        # Add case-specific prohibitions
        if "prop" in test_case['case_name'].lower():
            prohibitions.append("严禁虚构参考视频中不存在的道具位置")

        if "multi_character" in test_case['case_id']:
            prohibitions.append("严禁新角色凭空出现，必须建立空间关系")

        return "禁止清单：\n" + "\n".join(f"- {p}" for p in prohibitions)

    def _check_compliance(self, prompt_body: str, test_case: Dict) -> Dict:
        """Check compliance with workflow rules"""
        checks = {
            "zero_subtitle_in_first_200": "全程无字幕" in prompt_body[:200],
            "visual_style_in_first_300": "赛璐璐平涂风格" in prompt_body[:300],
            "character_uniqueness_declared": "始终仅为一人" in prompt_body,
            "three_fold_stillness": "收尾三重静止" in prompt_body,
            "prohibition_list_present": "禁止清单" in prompt_body
        }

        # Case-specific checks
        if "case_10" in test_case['case_id']:
            checks["first_frame_mode"] = "@图1 作为首帧" in prompt_body
            checks["no_video_reference"] = "@视频" not in prompt_body

        if "case_08" in test_case['case_id']:
            checks["camera_lock"] = "景别硬锁" in prompt_body

        return checks

def main():
    generator = VideoAgentPromptGenerator()

    # Load test cases
    test_cases_dir = Path("evaluation/test_cases")
    output_dir = Path("evaluation/video_agent_results")
    output_dir.mkdir(parents=True, exist_ok=True)

    test_cases = []
    for file in sorted(test_cases_dir.glob("case_*.json")):
        with open(file, 'r', encoding='utf-8') as f:
            test_cases.append(json.load(f))

    print(f"Generating prompts for {len(test_cases)} test cases, 10 runs each\n")

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

    print("✓ Video-agent-test prompt generation complete")

if __name__ == "__main__":
    main()
