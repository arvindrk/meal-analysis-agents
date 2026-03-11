# Meal Analysis Pipeline

Three-agent AI pipeline for glycemic meal analysis. A meal image enters as base64 and exits as structured JSON with a glycemic recommendation, macro estimates, ingredient breakdown, and redacted safety-safe guidance text.

---

## Architecture

![Agent Pipeline Architecture](architechture.png)

The pipeline runs in two modes:

| Mode | Flow |
|---|---|
| **Sequential** (default) | `guardrailCheck` → *(short-circuit if fail)* → `mealAnalysis` → `safetyChecks` → redaction |
| **Parallel** (`--parallel`) | `guardrailCheck` + `mealAnalysis` concurrently → `safetyChecks` → redaction |

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

```bash
npm run execute:pipeline              # sequential, n=3 samples
npm run execute:pipeline:parallel     # parallel guardrail+analysis, n=3 samples
npm run execute:guardrail             # guardrailCheck agent only
npm run execute:analysis              # mealAnalysis agent only
npm run execute:safety                # safetyChecks agent only
```

---

## Running Evals

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

# Optional: snapshot scores to evals/output/reports/
npm run eval:score:snapshot

# Optional: open Promptfoo UI
npm run eval:view
```

> Results are written to `evals/output/results/*.json`.

---

## Evaluation Results

> **Recommended stack: guardrailCheck → `gpt-5.4` | mealAnalysis → `gpt-4.1` | safetyChecks → `gpt-4o`**
>
> **Composite: 86.8 / 100 | End-to-end P50: 5,977 ms**

### Decision Matrix

| Scenario | guardrailCheck | mealAnalysis | safetyChecks | Composite | P50 (ms) |
|---|---|---|---|---|---|
| Best accuracy | gpt-5.4, gpt-5.2, gpt-5-mini, gpt-4.1-mini, gpt-5, gpt-4o | gpt-4.1 | gpt-4.1, gpt-5.2, gpt-5-mini, gpt-5.4, gpt-4.1-mini, gpt-4o, gpt-5 | 86.8 | 6,324 |
| Best value (score / 1k tokens) | gpt-4o | gpt-4o | gpt-4.1-mini, gpt-4o | 85.8 | 7,877 |
| Best latency | gpt-4.1-mini | gpt-4.1 | gpt-4o | 86.8 | 5,977 |
| **Balanced (accuracy + latency)** ✓ | **gpt-5.4** | **gpt-4.1** | **gpt-4o** | **86.8** | **5,977** |

### guardrailCheck

| Model | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) |
|---|---|---|---|---|
| **gpt-5.4** ✓ | 100.0 / 100 | 560 | 61 | 1,414 |
| gpt-4.1-mini | 100.0 / 100 | 669 | 26 | 1,404 |
| gpt-5.2 | 100.0 / 100 | 560 | 52 | 1,469 |
| gpt-4o | 100.0 / 100 | 508 | 26 | 1,770 |
| gpt-5-mini | 100.0 / 100 | 560 | 102 | 2,593 |
| gpt-5 | 100.0 / 100 | 462 | 120 | 3,754 |
| gpt-4.1 | 98.6 / 100 | 508 | 29 | 1,621 |
| gpt-4o-mini | 97.2 / 100 | 8,753 | 26 | 1,661 |

### mealAnalysis

| Model | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) |
|---|---|---|---|---|
| **gpt-4.1** ✓ | 81.2 / 100 | 876 | 233 | 3,660 |
| gpt-4o | 79.2 / 100 | 876 | 132 | 4,691 |
| gpt-4o-mini | 76.4 / 100 | 9,121 | 139 | 3,726 |
| gpt-4.1-mini | 75.7 / 100 | 1,037 | 154 | 3,494 |
| gpt-5.4 | 70.8 / 100 | 928 | 1,286 | 16,680 |
| gpt-5.2 | 69.0 / 100 | 928 | 540 | 9,367 |
| gpt-5-mini | 67.8 / 100 | 928 | 4,789 | 68,372 |
| gpt-5 | 67.3 / 100 | 830 | 3,478 | 71,060 |

**Component breakdown (gpt-4.1):**

| Component | Score | Weight in composite |
|---|---|---|
| is_food | 100.0 / 100 | — |
| text_quality (LLM-as-judge) | 95.6 / 100 | 30% |
| macros (MAPE-based) | 77.2 / 100 | 10% |
| recommendation (3-class) | 80.6 / 100 | 50% |
| ingredients (name + impact match) | 45.2 / 100 | 10% |

### safetyChecks

| Model | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) |
|---|---|---|---|---|
| **gpt-4o** ✓ | 87.5 / 100 | 620 | 58 | 913 |
| gpt-4.1 | 87.5 / 100 | 620 | 63 | 1,250 |
| gpt-4.1-mini | 87.5 / 100 | 620 | 58 | 1,416 |
| gpt-5.2 | 87.5 / 100 | 618 | 96 | 1,885 |
| gpt-5.4 | 87.5 / 100 | 618 | 109 | 1,967 |
| gpt-5-mini | 87.5 / 100 | 618 | 197 | 2,932 |
| gpt-5 | 87.5 / 100 | 618 | 282 | 5,522 |
| gpt-4o-mini | 84.4 / 100 | 620 | 58 | 1,560 |

---

## Key Observations

1. **guardrailCheck is a solved problem** — 6 of 8 models hit 100.0. Chosen `gpt-5.4` for its tight P99 tail (2,230 ms vs 3,392 ms for next-best `gpt-4.1-mini`), which matters for production p99 SLAs.

2. **mealAnalysis is the accuracy and latency bottleneck** — lowest scores (67–81) and highest latency. `gpt-5.x` models produce massive output tokens (up to 4,789 avg) with P50 latencies 4–20× higher than `gpt-4.1`, yielding *worse* scores. `gpt-4.1` is the clear winner.

3. **ingredients accuracy (45.2) is the primary accuracy gap** — recommendation (80.6), macros (77.2), and text quality (95.6) are strong. Ingredient name normalization and impact classification are the next improvement target.

4. **safetyChecks is efficient and consistent** — 7 of 8 models tie at 87.5. `gpt-4o` chosen for lowest P50 (913 ms). The remaining 12.5-point gap is consistent across models, pointing to prompt-level ambiguity in edge cases rather than model capability.

5. **Parallel mode reduces perceived latency** — running `guardrailCheck` and `mealAnalysis` concurrently removes sequential wait time. The pipeline short-circuit also means non-food images incur near-zero extra cost.

---

## Model Rationale

- **guardrailCheck → `gpt-5.4`:** Tied for 100.0 with five other models. Selected for best P99 tail latency (2,230 ms) — important since this gate runs on every request. `gpt-4.1-mini` ties on accuracy but has 52% higher P99.

- **mealAnalysis → `gpt-4.1`:** Best composite score (81.2) by 2 points over `gpt-4o`. `gpt-5.x` models score lower (67–71) due to verbose, unconstrained structured-output behavior — high token counts without accuracy gains.

- **safetyChecks → `gpt-4o`:** 7 models tie at 87.5. `gpt-4o` is fastest (P50 913 ms), and since this agent runs after `mealAnalysis`, minimizing its tail latency maximises end-to-end throughput.

---

## Next Steps

- **Ingredients accuracy** — primary gap (45.2/100). Candidates: few-shot examples with canonical ingredient names, retrieval-augmented ingredient lookup, or a dedicated normalization step post-inference.
- **Macros calibration** — 77.2/100 with high variance on dense/complex meals. Structured chain-of-thought or portion-estimation prompting may help.
- **Safety false positive rate** — 87.5 ceiling is consistent across models; audit the 12.5% miss cases to determine if they are ambiguous prompt scope or labeling issues in ground truth.
- **Parallel vs sequential latency in production** — validate P50 improvement from parallel mode under real load; ensure `guardrailCheck` short-circuit savings offset concurrent API cost.
