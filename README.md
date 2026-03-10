# Meal Analysis Pipeline

Three-agent AI pipeline: input guardrails → meal inference → output guardrails. Image → structured JSON with glycemic guidance. Uses Promptfoo for evals.

## Setup

- Node 18+, `npm install`
- `.env` with `OPENAI_API_KEY`
- Dataset: `data/images/`, `data/json-files/` (basename-match)

## Run

| Command | Description |
|---------|-------------|
| `npm run run:pipeline` | Full pipeline (sequential, n=3) |
| `npm run run:pipeline:parallel` | Full pipeline (parallel guardrail+analysis) |
| `npm run run -- --n 5 --parallel` | Override n, enable parallel |
| `npm run run:guardrail` | Guardrail agent only |

## Architecture

See [docs/architecture.md](docs/architecture.md).

- **Sequential (default):** guardrailCheck → mealAnalysis (if pass) → safetyChecks → redaction
- **Parallel (`--parallel`):** guardrailCheck + mealAnalysis concurrently; safetyChecks after; redaction if any safety check fails
- **Redaction:** When safetyChecks flag violations, pipeline replaces flagged text with `[Content removed for safety]` before returning

## Evals

Platform: Promptfoo

```bash
npm run eval:all
npm run eval:score
npm run eval:view
```

Results: `evals/output/results/*.json`. Snapshot: `npm run eval:score:snapshot` → `evals/output/reports/`.

### Reports

- [meal-eval-report-v0](evals/output/reports/meal-eval-report-v0.md)
  - Baseline. 87.8 composite, P50 6321 ms.
  - mealAnalysis bottleneck; gpt-4.1 best for structured output.
  - Safety over-flagging on mini models.
- [meal-eval-report-v1](evals/output/reports/meal-eval-report-v1.md)
  - Prompt improvements, safety fix. 86.8 composite, P50 5977 ms.
  - 6 models at 100 on guardrailCheck.
  - ingredients_score dropped; latency ~5% faster.

## Results

**Recommended stack:** guardrailCheck gpt-5.4 | mealAnalysis gpt-4.1 | safetyChecks gpt-4o

**Composite:** 86.8/100 | **P50:** 5,977 ms

### Per-agent

| Agent | Model | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) |
|-------|-------|------------|------------------|-------------------|----------|
| guardrailCheck | **gpt-5.4** | 100.0/100 | 560 | 61 | 1,414 |
| mealAnalysis | **gpt-4.1** | 81.2/100 | 876 | 233 | 3,660 |
| safetyChecks | **gpt-4o** | 87.5/100 | 620 | 58 | 913 |

## Model rationale

- **guardrailCheck:** gpt-5.4 — 100.0/100, lower P99 latency among top scorers (2230 ms vs 3392 for gpt-4.1-mini)
- **mealAnalysis:** gpt-4.1 — best structured output; gpt-5.x higher latency, not cost-effective
- **safetyChecks:** gpt-4o — 87.5/100, lowest P50 among top scorers

## Observations

1. guardrailCheck: 6 models at 100; gpt-5.4 has best P99
2. mealAnalysis: bottleneck; ingredients ~45; gpt-4.1 best
3. safetyChecks: 7 models at 87.5; gpt-4o fastest
4. Parallel mode reduces latency when guardrail+analysis run together

## Next steps

- Improve ingredients accuracy (prompts, few-shot, retrieval)
- Calibrate macros for high-stakes cases
- Monitor safety false positives
- Measure parallel vs sequential latency in production
