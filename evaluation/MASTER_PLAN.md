# Evaluation Master Plan

## Overview
Comprehensive evaluation comparing video-agent-test (reference system) with MOBAI-ASSESTS-Agent (target system) across 10 test cases, 10 runs each.

## Test Cases Generated
1. **case_01**: Emotional confrontation - pregnant Luna discovers Alpha cheating
2. **case_02**: Indoor dialogue - kitchen monologue with sudden interruption
3. **case_03**: Silent emotion - no dialogue micro-expression close-up
4. **case_04**: Multi-character entry - new character Kennedy introduction
5. **case_05**: Cross-scene transition - indoor to outdoor cemetery
6. **case_06**: English dialogue sync - multi-turn conversation timing
7. **case_07**: Prop continuity - car keys first appearance handling
8. **case_08**: Camera lock - push to close-up then stop
9. **case_09**: Character uniqueness - avoid duplicate @image references
10. **case_10**: First-frame mode - using end frame PNG as anchor

## Evaluation Phases

### Phase 1: Video-Agent-Test Baseline (Task #5)
- Run each case 10 times through video-agent-test workflow
- Record all generated prompts (stop before actual video generation)
- Capture: frontmatter, prompt body, metadata

### Phase 2: MOBAI-Agent Initial Run (Task #4)
- Run each case 10 times through MOBAI-ASSESTS-Agent
- Record all generated prompts
- Same stopping point (before FC tool invocation)

### Phase 3: Detailed Comparison (Task #3)
- Word-by-word diff analysis
- Quality metrics: adherence to WORKFLOW.md rules, E-1 to E-12 compliance
- Consistency across 10 runs per case

### Phase 4: Incremental Alignment (Task #2)
- Identify gaps in MOBAI agent skills
- Make small diffs (max 50 chars per change)
- Re-run affected cases after each change
- Iterate until alignment achieved

### Phase 5: Final Report (Task #1)
- Comprehensive markdown report
- All test results, comparisons, changes made
- Recommendations for production deployment

## Execution Strategy
Since we cannot actually run video generation, we'll:
1. Create detailed prompt templates based on WORKFLOW.md
2. Simulate the decision-making process for each test case
3. Generate realistic prompts that follow all rules
4. Compare structural adherence and quality

## Key Metrics
- Zero-subtitle defense presence (E-1)
- English dialogue sync format (E-6)
- Camera lock compliance (E-8)
- Three-fold stillness ending (E-9)
- Character uniqueness (防御清单 #3)
- Prop continuity (防御清单 #2)
- First-frame mode compliance (防御清单 #5)
