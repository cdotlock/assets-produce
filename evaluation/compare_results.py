#!/usr/bin/env python3
"""
Comparison and Analysis Framework
Compares outputs from video-agent-test and MOBAI-ASSESTS-Agent
"""

import json
import difflib
from pathlib import Path
from typing import Dict, List, Tuple

class ResultComparator:
    def __init__(self, video_agent_dir: str, mobai_agent_dir: str, analysis_dir: str):
        self.video_agent_dir = Path(video_agent_dir)
        self.mobai_agent_dir = Path(mobai_agent_dir)
        self.analysis_dir = Path(analysis_dir)
        self.analysis_dir.mkdir(parents=True, exist_ok=True)

    def load_case_results(self, case_id: str) -> Tuple[Dict, Dict]:
        """Load results for a specific case from both systems"""
        video_file = self.video_agent_dir / f"{case_id}_results.json"
        mobai_file = self.mobai_agent_dir / f"{case_id}_results.json"

        with open(video_file, 'r', encoding='utf-8') as f:
            video_results = json.load(f)

        with open(mobai_file, 'r', encoding='utf-8') as f:
            mobai_results = json.load(f)

        return video_results, mobai_results

    def compare_prompts(self, prompt1: str, prompt2: str) -> Dict:
        """Compare two prompts and return diff analysis"""
        diff = list(difflib.unified_diff(
            prompt1.splitlines(keepends=True),
            prompt2.splitlines(keepends=True),
            lineterm=''
        ))

        similarity = difflib.SequenceMatcher(None, prompt1, prompt2).ratio()

        return {
            "similarity_ratio": similarity,
            "diff_lines": len(diff),
            "diff": ''.join(diff)
        }

    def analyze_case(self, case_id: str) -> Dict:
        """Analyze all runs for a specific case"""
        video_results, mobai_results = self.load_case_results(case_id)

        analysis = {
            "case_id": case_id,
            "case_name": video_results['test_case']['case_name'],
            "run_comparisons": [],
            "aggregate_metrics": {
                "avg_similarity": 0.0,
                "consistency_video": 0.0,
                "consistency_mobai": 0.0
            }
        }

        similarities = []

        # Compare each run
        for i in range(len(video_results['runs'])):
            video_run = video_results['runs'][i]
            mobai_run = mobai_results['runs'][i]

            comparison = self.compare_prompts(
                video_run['prompt_body'],
                mobai_run['prompt_body']
            )

            analysis['run_comparisons'].append({
                "run_number": i + 1,
                "comparison": comparison
            })

            similarities.append(comparison['similarity_ratio'])

        analysis['aggregate_metrics']['avg_similarity'] = sum(similarities) / len(similarities)

        return analysis

    def run_full_analysis(self):
        """Run analysis for all cases"""
        case_files = sorted(self.video_agent_dir.glob("case_*_results.json"))

        print(f"Analyzing {len(case_files)} cases\n")

        all_analyses = []

        for case_file in case_files:
            case_id = case_file.stem.replace('_results', '')
            print(f"Analyzing {case_id}...")

            analysis = self.analyze_case(case_id)
            all_analyses.append(analysis)

            # Save individual analysis
            output_file = self.analysis_dir / f"{case_id}_analysis.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(analysis, f, ensure_ascii=False, indent=2)

            print(f"  Avg similarity: {analysis['aggregate_metrics']['avg_similarity']:.2%}")
            print(f"  Saved to {output_file}\n")

        # Save overall summary
        summary = {
            "total_cases": len(all_analyses),
            "overall_avg_similarity": sum(a['aggregate_metrics']['avg_similarity'] for a in all_analyses) / len(all_analyses),
            "cases": [a['case_id'] for a in all_analyses]
        }

        summary_file = self.analysis_dir / "analysis_summary.json"
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        print(f"✓ Analysis complete. Summary saved to {summary_file}")
        return all_analyses

if __name__ == "__main__":
    comparator = ResultComparator(
        video_agent_dir="evaluation/video_agent_results",
        mobai_agent_dir="evaluation/mobai_agent_results",
        analysis_dir="evaluation/analysis"
    )
    comparator.run_full_analysis()
