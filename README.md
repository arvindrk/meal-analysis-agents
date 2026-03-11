# Meal Analysis Pipeline

Three-agent AI pipeline for glycemic meal analysis. A meal image enters as base64 and exits as structured JSON with a glycemic recommendation, macro estimates, ingredient breakdown, and redacted safety-safe guidance text.

---

## Architecture

![Agent Pipeline Architecture](architechture.png)

The pipeline runs in two modes:

| Mode                        | Flow                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Sequential** (default)    | `guardrailCheck` → _(short-circuit if fail)_ → `mealAnalysis` → `safetyChecks` → redaction                             |
| **Parallel** (`--parallel`) | `guardrailCheck` + `mealAnalysis` concurrently → _(short-circuit if guardrailCheck fail)_ → `safetyChecks` → redaction |

**Short-circuit:** if `guardrailCheck` fails (not food, PII, human, captcha), the pipeline returns immediately — no LLM calls for `mealAnalysis` or `safetyChecks`.

**Redaction:** if any `safetyChecks` flag fires, `guidance_message`, `meal_title`, `meal_description`, and all ingredient names are replaced with `[Content removed for safety]`.

---

## Eval Platform

**[Promptfoo](https://promptfoo.dev)** — chosen for native multimodal (image) test case support, YAML-driven model comparison across 8 models × 72 test cases, custom TypeScript asserters, and built-in LLM-as-judge scoring.

---

## Setup

**Prerequisites:** Node 18+, npm

```bash
npm install
```

Create a `.env` file in the project root:

```
OPENAI_API_KEY=your_key_here
```

Place the dataset files in:

```
data/
  images/        # meal images as <image_id>.jpg
  json-files/    # ground-truth JSON as <image_id>.json
```

---

## Running the Pipeline

### Individual Agents

```bash
npm run execute:guardrail      # guardrailCheck agent only
npm run execute:analysis       # mealAnalysis agent only
npm run execute:safety         # safetyChecks agent only
```

### Full Pipeline

```bash
npm run execute:pipeline              # sequential mode
npm run execute:pipeline:parallel     # parallel guardrail+analysis
```

> Append `-- --n <count>` to run on a smaller sample for quick validation (e.g. `npm run execute:pipeline -- --n 5`).

---

## Running Evals

### Agent Evals

Each step depends on the previous output. Run in order:

```bash
# 1. Generate Promptfoo test cases from data/json-files/
npm run eval:generate

# 2. Evaluate guardrailCheck across all models
npm run eval:guardrail

# 3. Evaluate mealAnalysis across all models
npm run eval:analysis

# 4. Merge mealAnalysis outputs to build safetyChecks dataset
npm run eval:merge-meal

# 5. Evaluate safetyChecks across all models
npm run eval:safety

# 6. Compute composite scores from all three result files
npm run eval:score

# Snapshot scores and write a timestamped Markdown report to evals/output/reports/
npm run eval:score:snapshot

# Open Promptfoo UI to browse results
npm run eval:view
```

> Results are written to `evals/output/results/*.json`.

### Pipeline Eval (Integration)

Runs the recommended stack (`gpt-5.4` / `gpt-4.1` / `gpt-4.1`) in both sequential and parallel modes against all 72 test cases. Validates that both modes produce identical correctness scores (short-circuit logic, redaction) and surfaces the latency delta between modes — confirming whether parallel scheduling is worth the added orchestration complexity in production.

```bash
npm run eval:pipeline
```

| Mode                | Score             | Tests Passed | P50 (ms)          | P75 (ms)          | P95 (ms)          |
| ------------------- | ----------------- | ------------ | ----------------- | ----------------- | ----------------- |
| Sequential          | 71.5 / 72 (99.3%) | 71 / 72      | 6,703             | 8,069             | 9,496             |
| Parallel            | 71.5 / 72 (99.3%) | 71 / 72      | 4,987             | 5,439             | 6,858             |
| **Δ Parallel gain** | —                 | —            | **−1,716 (−26%)** | **−2,630 (−33%)** | **−2,638 (−28%)** |

Identical scores across both modes confirm correctness parity. Parallel scheduling delivers a consistent 26–33% latency reduction with no accuracy trade-off.

---

## Model Rationale

- **guardrailCheck → `gpt-5.4`:** Tied for 100.0 with five other models. Selected for best P99 tail latency (2,230 ms) — important since this gate runs on every request. `gpt-4.1-mini` ties on accuracy but has 52% higher P99.

- **mealAnalysis → `gpt-4.1`:** Best composite score (83.8) by 7.5 points over `gpt-4o`. `gpt-5.x` models score lower (67–73) due to verbose, unconstrained structured-output behavior — high token counts without accuracy gains.

- **safetyChecks → `gpt-4.1`:** 7 models tie at 87.5. `gpt-4.1` chosen over `gpt-4o` for 32% better P99 tail latency (3,185 ms vs 4,702 ms) at the cost of 92 ms P50. Since this agent runs last, P99 tail directly impacts end-to-end worst-case latency — making tail improvement more valuable than marginal P50 gains.

---

## Evaluation Results

> **Recommended stack: guardrailCheck → `gpt-5.4` | mealAnalysis → `gpt-4.1` | safetyChecks → `gpt-4.1`**
>
> **Composite: 88.2 / 100 | End-to-end P50: 9,798 ms**

Detailed reports: [v0 — Baseline](evals/output/reports/meal-eval-report-v0.md) | [v1 — Current](evals/output/reports/meal-eval-report-v1.md)

### Decision Matrix

| Scenario                            | guardrailCheck | mealAnalysis | safetyChecks | Composite | P50 (ms)  |
| ----------------------------------- | -------------- | ------------ | ------------ | --------- | --------- |
| Best accuracy                       | gpt-5.4        | gpt-4.1      | gpt-4.1      | 88.2      | 9,798     |
| Best latency                        | gpt-4.1-mini   | gpt-4.1      | gpt-4o       | 88.2      | 9,788     |
| **Balanced (accuracy + latency)** ✓ | **gpt-5.4**    | **gpt-4.1**  | **gpt-4.1**  | **88.2**  | **9,798** |

> Multiple models in a single cell indicate a tie at that score for that agent. The per-agent tables below list all tested models ranked by score, with the recommended model at the top.

### guardrailCheck

| Model         | Eval Score  | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P99 (ms) |
| ------------- | ----------- | ---------------- | ----------------- | -------- | -------- |
| **gpt-5.4** ✓ | 100.0 / 100 | 560              | 61                | 1,414    | 2,230    |
| gpt-4.1-mini  | 100.0 / 100 | 669              | 26                | 1,404    | 3,392    |
| gpt-5.2       | 100.0 / 100 | 560              | 52                | 1,469    | 3,129    |
| gpt-4o        | 100.0 / 100 | 508              | 26                | 1,770    | 2,921    |
| gpt-5-mini    | 100.0 / 100 | 560              | 102               | 2,593    | 5,256    |
| gpt-5         | 100.0 / 100 | 462              | 120               | 3,754    | 10,718   |
| gpt-4.1       | 98.6 / 100  | 508              | 29                | 1,621    | 3,414    |
| gpt-4o-mini   | 97.2 / 100  | 8,753            | 26                | 1,661    | 4,531    |

### mealAnalysis

| Model         | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P99 (ms) |
| ------------- | ---------- | ---------------- | ----------------- | -------- | -------- |
| **gpt-4.1** ✓ | 83.8 / 100 | 655              | 220               | 6,621    | 10,632   |
| gpt-4o-mini   | 77.1 / 100 | 8,900            | 138               | 7,311    | 11,614   |
| gpt-4.1-mini  | 76.5 / 100 | 816              | 153               | 6,844    | 10,161   |
| gpt-4o        | 76.3 / 100 | 655              | 129               | 7,840    | 11,851   |
| gpt-5.4       | 73.0 / 100 | 707              | 446               | 11,009   | 22,486   |
| gpt-5.2       | 70.7 / 100 | 707              | 390               | 10,779   | 16,244   |
| gpt-5-mini    | 70.0 / 100 | 707              | 1,087             | 25,876   | 45,957   |
| gpt-5         | 67.2 / 100 | 609              | 1,432             | 26,663   | 58,359   |

**Component breakdown (gpt-4.1):**

| Component                         | Score       | Weight in composite |
| --------------------------------- | ----------- | ------------------- |
| is_food                           | 100.0 / 100 | —                   |
| text_quality (LLM-as-judge)       | 97.2 / 100  | 30%                 |
| macros (MAPE-based)               | 78.8 / 100  | 10%                 |
| recommendation (3-class)          | 81.9 / 100  | 50%                 |
| ingredients (name + impact match) | 58.2 / 100  | 10%                 |

### safetyChecks

| Model         | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P99 (ms) |
| ------------- | ---------- | ---------------- | ----------------- | -------- | -------- |
| **gpt-4.1** ✓ | 87.5 / 100 | 621              | 63                | 1,855    | 3,185    |
| gpt-4o        | 87.5 / 100 | 621              | 58                | 1,763    | 4,702    |
| gpt-4.1-mini  | 87.5 / 100 | 621              | 58                | 2,107    | 3,547    |
| gpt-5.2       | 87.5 / 100 | 619              | 94                | 2,815    | 4,573    |
| gpt-5.4       | 87.5 / 100 | 619              | 112               | 3,043    | 4,714    |
| gpt-5-mini    | 87.5 / 100 | 619              | 192               | 4,555    | 6,940    |
| gpt-5         | 87.5 / 100 | 619              | 266               | 6,190    | 11,450   |
| gpt-4o-mini   | 82.8 / 100 | 621              | 58                | 2,289    | 6,245    |

---

## Key Observations

1. **guardrailCheck is a solved problem** — 6 of 8 models hit 100.0. Chosen `gpt-5.4` for its tight P99 tail (2,230 ms vs 3,392 ms for next-best `gpt-4.1-mini`), which matters for production p99 SLAs.

2. **mealAnalysis is the accuracy and latency bottleneck** — lowest scores (67–84) and highest latency. `gpt-5.x` models produce excessive output tokens (up to 1,432 avg) with P50 latencies 4–20× higher than `gpt-4.1`, yielding _worse_ scores. `gpt-4.1` is the clear winner.

3. **ingredients accuracy (58.2) is the primary accuracy gap** — recommendation (81.9), macros (78.8), and text quality (97.2) are strong. Ingredient name normalization and impact classification are the next improvement target.

4. **safetyChecks is efficient and consistent** — 7 of 8 models tie at 87.5. `gpt-4.1` chosen over `gpt-4o` for 32% better P99 tail latency (3,185 ms vs 4,702 ms) at the cost of 92 ms P50 — the better production trade-off. The remaining 12.5-point gap is consistent across models, pointing to prompt-level ambiguity in edge cases rather than model capability.

5. **Parallel mode reduces P50 by 1,716 ms (26%)** — from 6,703 ms to 4,987 ms — with no accuracy trade-off (both modes score 71.5/72 on the integration eval). The P75 and P95 gains are larger still (33% and 28%), meaning tail latency improves disproportionately. The pipeline short-circuit also means non-food images incur near-zero extra cost.

---

## Known Gaps & Open Questions

- **Ingredients accuracy (58.2) is the primary eval gap** — few-shot examples would help calibrate name normalization and glycemic impact classification. The current prompt treats all ingredients generically; domain-specific examples (e.g. canonical ingredient names with known glycemic impact) would likely close most of this gap. Risk: overfitting the prompt to the training set; needs held-out validation before shipping.
- **safetyChecks hard ceiling at 87.5 across all models** — root cause is `no_carb_content`: the model flags any carb mention regardless of context or quantity. This is a prompt precision problem, not a model capability limit. The fix is tightening the property definition — distinguishing incidental carb references from actionable carb content.
- **8 ground truth records are missing safetyChecks labels** — skipped silently by the pipeline today, which slightly reduces the effective eval sample size. Backfill strategy TBD; until resolved, the 87.5 ceiling may be marginally understated.

---

## Iteration History

### v0 — Baseline

[meal-eval-report-v0](evals/output/reports/meal-eval-report-v0.md) | Composite: 87.8 / 100 | P50: 6,321 ms | 11 models tested per agent (incl. nano, o4-mini variants)

**Key findings that drove Phase 1:**

- guardrailCheck peaked at **98.6** — not 100; prompt ambiguity suspected on edge-case images
- safetyChecks over-flagging on mini models: `gpt-4.1-mini` scored 71.9, `gpt-4o-mini` scored 75.0
- Nano models (`gpt-5-nano`, `gpt-4.1-nano`) consistently poor across all agents — not worth evaluating further
- `o4-mini` verbose and slow (144 output tokens on guardrail, 962 on meal) with no accuracy gain over cheaper models

### v1 — Phase 1

[meal-eval-report-v1](evals/output/reports/meal-eval-report-v1.md) | [commit 3bcb472](https://github.com/arvindrk/meal-analysis-agents/commit/3bcb472ae9c32072b93bbed562d96086dfec0307)

**Changes made:**

- Dropped `gpt-5-nano`, `gpt-4.1-nano`, `o4-mini` from all eval configs — narrowed model matrix from 11 → 8
- Prompt improvements across all three agents. View [commit 3bcb472](https://github.com/arvindrk/meal-analysis-agents/commit/3bcb472ae9c32072b93bbed562d96086dfec0307) for prompt updates
- `temperature: 0` set for non-gpt-5 models for deterministic structured output
- `detail: high` for mealAnalysis image input
- Safety over-flagging fix applied to safetyChecks prompt

**Results:**

| Metric                      | v0   | v1        | Δ     |
| --------------------------- | ---- | --------- | ----- |
| Composite                   | 87.8 | 88.2      | +0.4  |
| guardrailCheck top score    | 98.6 | **100.0** | +1.4  |
| Models at guardrail 100.0   | 0    | **6**     | +6    |
| safetyChecks models at 87.5 | 3    | **7**     | +4    |
| `gpt-4.1-mini` safety score | 71.9 | **87.5**  | +15.6 |
| ingredients_score           | 58.9 | 58.2      | −0.7  |

guardrailCheck and safetyChecks improved significantly. mealAnalysis composite held roughly flat (83.7 → 83.8); ingredients accuracy barely moved (58.9 → 58.2). The composite improved +0.4 to 88.2, driven by guardrailCheck and safetyChecks gains. P50 increased (+55%) as mealAnalysis latency grew with the ‘detail: high’ image prompt change.

---

## Next Steps

- **Ingredients accuracy** — primary gap (58.2/100). Candidates: few-shot examples with canonical ingredient names, retrieval-augmented ingredient lookup, or a dedicated normalization step post-inference.
- **Macros calibration** — 78.8/100 with high variance on dense/complex meals. Structured chain-of-thought or portion-estimation prompting may help.
- **Safety false positive rate** — 87.5 ceiling is consistent across models; audit the 12.5% miss cases to determine if they are ambiguous prompt scope or labeling issues in ground truth.
- **Parallel vs sequential latency in production** — validate P50 improvement from parallel mode under real load; ensure `guardrailCheck` short-circuit savings offset concurrent API cost.
