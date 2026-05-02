#!/usr/bin/env python3
"""
Detailed Comparison and Gap Analysis
Compares video-agent-test and MOBAI-ASSESTS-Agent outputs
"""

import json
from pathlib import Path
from typing import Dict, List
import difflib

class DetailedComparator:
    def __init__(self):
        self.video_dir = Path("evaluation/video_agent_results")
        self.mobai_dir = Path("evaluation/mobai_agent_results")
        self.analysis_dir = Path("evaluation/analysis")
        self.analysis_dir.mkdir(parents=True, exist_ok=True)

    def analyze_all_cases(self):
        """Run detailed analysis on all cases"""
        case_files = sorted(self.video_dir.glob("case_*_results.json"))

        print(f"Analyzing {len(case_files)} cases\n")

        all_analyses = []
        gap_summary = {}

        for case_file in case_files:
            case_id = case_file.stem.replace('_results', '')
            print(f"Analyzing {case_id}...")

            analysis = self.analyze_case(case_id)
            all_analyses.append(analysis)

            # Collect gaps
            for gap in analysis['identified_gaps']:
                gap_summary[gap] = gap_summary.get(gap, 0) + 1

            print(f"  Found {len(analysis['identified_gaps'])} gap types")
            print(f"  Avg prompt length diff: {analysis['metrics']['avg_length_diff']:.0f} chars\n")

        # Generate summary report
        self.generate_summary_report(all_analyses, gap_summary)

        return all_analyses

    def analyze_case(self, case_id: str) -> Dict:
        """Analyze a single case"""
        # Load results
        video_file = self.video_dir / f"{case_id}_results.json"
        mobai_file = self.mobai_dir / f"{case_id}_results.json"

        with open(video_file, 'r', encoding='utf-8') as f:
            video_data = json.load(f)

        with open(mobai_file, 'r', encoding='utf-8') as f:
            mobai_data = json.load(f)

        # Analyze runs
        run_comparisons = []
        all_gaps = set()

        for i in range(len(video_data['runs'])):
            video_run = video_data['runs'][i]
            mobai_run = mobai_data['runs'][i]

            comparison = self.compare_runs(video_run, mobai_run)
            run_comparisons.append(comparison)

            all_gaps.update(mobai_run['metadata'].get('gaps_present', []))

        # Calculate metrics
        metrics = self.calculate_metrics(run_comparisons)

        analysis = {
            "case_id": case_id,
            "case_name": video_data['test_case']['case_name'],
            "identified_gaps": list(all_gaps),
            "run_comparisons": run_comparisons,
            "metrics": metrics
        }

        # Save individual analysis
        output_file = self.analysis_dir / f"{case_id}_analysis.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, ensure_ascii=False, indent=2)

        return analysis

    def compare_runs(self, video_run: Dict, mobai_run: Dict) -> Dict:
        """Compare two runs"""
        video_prompt = video_run['prompt_body']
        mobai_prompt = mobai_run['prompt_body']

        # Calculate similarity
        similarity = difflib.SequenceMatcher(None, video_prompt, mobai_prompt).ratio()

        # Generate diff
        diff = list(difflib.unified_diff(
            video_prompt.splitlines(keepends=True),
            mobai_prompt.splitlines(keepends=True),
            lineterm=''
        ))

        # Check compliance
        video_compliance = video_run['metadata'].get('compliance_checklist', {})
        mobai_gaps = mobai_run['metadata'].get('gaps_present', [])

        return {
            "run_number": video_run['run_number'],
            "similarity_ratio": similarity,
            "length_diff": len(video_prompt) - len(mobai_prompt),
            "video_length": len(video_prompt),
            "mobai_length": len(mobai_prompt),
            "diff_lines": len(diff),
            "video_compliance": video_compliance,
            "mobai_gaps": mobai_gaps
        }

    def calculate_metrics(self, comparisons: List[Dict]) -> Dict:
        """Calculate aggregate metrics"""
        return {
            "avg_similarity": sum(c['similarity_ratio'] for c in comparisons) / len(comparisons),
            "avg_length_diff": sum(c['length_diff'] for c in comparisons) / len(comparisons),
            "avg_video_length": sum(c['video_length'] for c in comparisons) / len(comparisons),
            "avg_mobai_length": sum(c['mobai_length'] for c in comparisons) / len(comparisons)
        }

    def generate_summary_report(self, analyses: List[Dict], gap_summary: Dict):
        """Generate summary report"""
        report = {
            "total_cases": len(analyses),
            "overall_metrics": {
                "avg_similarity": sum(a['metrics']['avg_similarity'] for a in analyses) / len(analyses),
                "avg_length_diff": sum(a['metrics']['avg_length_diff'] for a in analyses) / len(analyses)
            },
            "gap_frequency": gap_summary,
            "cases": [
                {
                    "case_id": a['case_id'],
                    "case_name": a['case_name'],
                    "gaps": a['identified_gaps'],
                    "similarity": a['metrics']['avg_similarity']
                }
                for a in analyses
            ]
        }

        output_file = self.analysis_dir / "comparison_summary.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"\n✓ Summary report saved to {output_file}")
        print(f"\nOverall Similarity: {report['overall_metrics']['avg_similarity']:.2%}")
        print(f"Avg Length Difference: {report['overall_metrics']['avg_length_diff']:.0f} chars")
        print(f"\nMost Common Gaps:")
        for gap, count in sorted(gap_summary.items(), key=lambda x: x[1], reverse=True):
            print(f"  - {gap}: {count} cases")

def main():
    comparator = DetailedComparator()
    comparator.analyze_all_cases()

if __name__ == "__main__":
    main()
