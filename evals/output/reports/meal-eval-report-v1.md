# Meal Analysis Evaluation Report (v1)

**Baseline:** v0 | **Changes:** Prompt improvements, temperature settings, image detail, safety over-flagging fix

**Date:** 2026-03-11

---

## 1.1 Decision Matrix

| Scenario                             | guardrailCheck                                            | mealAnalysis | safetyChecks                                                       | Composite | P50 (ms) |
| ------------------------------------ | --------------------------------------------------------- | ------------ | ------------------------------------------------------------------ | --------- | -------- |
| Best accuracy                        | gpt-5.4, gpt-5.2, gpt-5-mini, gpt-4.1-mini, gpt-5, gpt-4o | gpt-4.1      | gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-5.2, gpt-5.4, gpt-5-mini, gpt-5 | 88.2/100  | 9798     |
| Best value (score per 1k tokens)     | gpt-4o                                                    | gpt-4o       | gpt-4o, gpt-4.1-mini                                               | 84.4/100  | 11373    |
| Best latency                         | gpt-4.1-mini                                              | gpt-4.1      | gpt-4o                                                             | 88.2/100  | 9788     |
| **Balanced (accuracy + latency)**    | gpt-5.4                                                   | gpt-4.1      | gpt-4.1                                                            | 88.2/100  | 9798     |
| Balanced (accuracy + latency + cost) | gpt-5.4                                                   | gpt-4.1      | gpt-4.1                                                            | 88.2/100  | 9798     |

## 1.2 Recommended Architecture

> **Recommended stack** — Balanced (accuracy + latency) across all three agents. Same composite as best-accuracy; guardrailCheck model chosen for P99 SLA over pure P50.

| Agent              | Model   | Score     | Rationale                                                                                                          |
| ------------------ | ------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| **guardrailCheck** | gpt-5.4 | 100.0/100 | Tied top accuracy; chosen for best P99 tail (2,230 ms vs 3,392 ms for gpt-4.1-mini) — critical for production SLAs |
| **mealAnalysis**   | gpt-4.1 | 83.8/100  | Best composite for structured output (recommendation, macros, ingredients)                                         |
| **safetyChecks**   | gpt-4.1 | 87.5/100  | Tied top score; best P99 tail latency (3,185 ms vs 4,702 ms for gpt-4o) — 32% improvement at cost of 92 ms P50     |

**Composite eval score:** 88.2/100

**End-to-end latency:** P50 9798 ms | P75 11122 ms | P95 14046 ms | P99 17564 ms

_Key takeaway: This stack matches best-accuracy composite. guardrailCheck: gpt-5.4 over gpt-4.1-mini for 52% better P99 (2,230 ms vs 3,392 ms) at near-identical P50. safetyChecks: gpt-4.1 over gpt-4o for 32% better P99 (3,185 ms vs 4,702 ms) at cost of 92 ms P50._

### Key Observations - (Manually Added Section)

1. **guardrailCheck improved** — 6 models now at **100.0** (gpt-5.4, gpt-5.2, gpt-5-mini, gpt-4.1-mini, gpt-5, gpt-4o) vs v0’s top of 98.6. gpt-5.4 chosen over gpt-4.1-mini: both tied at 100.0 but gpt-5.4 P99 is 2,230 ms vs 3,392 ms — a 52% tail improvement that matters for production SLAs.

2. **mealAnalysis is still the bottleneck** — Lowest scores (67–84) and highest latency. ingredients_score: 58.9 → **58.2** (marginal change); recommendation and macros improved slightly. gpt-4.1 remains best for structured output.

3. **safetyChecks improved** — 7 models at **87.5** (vs 3 in v0). gpt-4.1-mini: 71.9 → 87.5; gpt-4o-mini: 75.0 → 82.8. Over-flagging fix helped. gpt-4.1 chosen over gpt-4o: 32% better P99 (3,185 ms vs 4,702 ms) at cost of 92 ms P50 — better tail behaviour for production SLAs.

4. **Composite up 0.4** — 87.8 → **88.2**, driven by guardrailCheck and safetyChecks gains. mealAnalysis composite held roughly flat (83.7 → 83.8).

5. **gpt-5.x on mealAnalysis** — Still high output tokens and latency (e.g. gpt-5-mini: 1,087 avg output, 26s P50). Not cost-effective for this pipeline.

---

## 1.3 guardrailCheck

| Model            | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P75 (ms) | P95 (ms) | P99 (ms) |
| ---------------- | ---------- | ---------------- | ----------------- | -------- | -------- | -------- | -------- |
| **gpt-4.1-mini** | 100.0/100  | 669              | 26                | 1404     | 1774     | 2304     | 3392     |
| **gpt-5.4**      | 100.0/100  | 560              | 61                | 1414     | 1540     | 1685     | 2230     |
| **gpt-5.2**      | 100.0/100  | 560              | 52                | 1469     | 1706     | 2202     | 3129     |
| **gpt-4o**       | 100.0/100  | 508              | 26                | 1770     | 2065     | 2612     | 2921     |
| **gpt-5-mini**   | 100.0/100  | 560              | 102               | 2593     | 3010     | 4187     | 5256     |
| **gpt-5**        | 100.0/100  | 462              | 120               | 3754     | 4387     | 6175     | 10718    |
| gpt-4.1          | 98.6/100   | 508              | 29                | 1621     | 2065     | 2373     | 3414     |
| gpt-4o-mini      | 97.2/100   | 8753             | 26                | 1661     | 1970     | 2820     | 4531     |

## 1.4 mealAnalysis (weighted composite)

| Model        | Composite Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P75 (ms) | P95 (ms) | P99 (ms) |
| ------------ | --------------- | ---------------- | ----------------- | -------- | -------- | -------- | -------- |
| **gpt-4.1**  | 83.8/100        | 655              | 220               | 6621     | 7521     | 9530     | 10632    |
| gpt-4o-mini  | 77.1/100        | 8900             | 138               | 7311     | 8156     | 9836     | 11614    |
| gpt-4.1-mini | 76.5/100        | 816              | 153               | 6844     | 7541     | 8700     | 10161    |
| gpt-4o       | 76.3/100        | 655              | 129               | 7840     | 8747     | 11200    | 11851    |
| gpt-5.4      | 73.0/100        | 707              | 446               | 11009    | 14336    | 19101    | 22486    |
| gpt-5.2      | 70.7/100        | 707              | 390               | 10779    | 12264    | 14687    | 16244    |
| gpt-5-mini   | 70.0/100        | 707              | 1087              | 25876    | 30147    | 37430    | 45957    |
| gpt-5        | 67.2/100        | 609              | 1433              | 26663    | 33923    | 47592    | 58359    |

### Component breakdown (avg scores, first model)

- **is_food_score:** 100.0/100
- **recommendation_score:** 81.9/100
- **macros_score:** 78.8/100
- **ingredients_score:** 58.2/100
- **text_quality_score:** 97.2/100

## 1.5 safetyChecks

| Model            | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P75 (ms) | P95 (ms) | P99 (ms) |
| ---------------- | ---------- | ---------------- | ----------------- | -------- | -------- | -------- | -------- |
| **gpt-4o**       | 87.5/100   | 621              | 58                | 1763     | 2061     | 2831     | 4702     |
| **gpt-4.1**      | 87.5/100   | 621              | 63                | 1855     | 2228     | 2774     | 3185     |
| **gpt-4.1-mini** | 87.5/100   | 621              | 58                | 2107     | 2515     | 3008     | 3547     |
| **gpt-5.2**      | 87.5/100   | 619              | 94                | 2815     | 3208     | 4092     | 4573     |
| **gpt-5.4**      | 87.5/100   | 619              | 112               | 3043     | 3317     | 3891     | 4714     |
| **gpt-5-mini**   | 87.5/100   | 619              | 192               | 4555     | 5209     | 6623     | 6940     |
| **gpt-5**        | 87.5/100   | 619              | 266               | 6190     | 7397     | 8350     | 11450    |
| gpt-4o-mini      | 82.8/100   | 621              | 58                | 2289     | 2638     | 3527     | 6245     |
