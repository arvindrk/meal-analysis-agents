# Meal Analysis Evaluation Report (v1)

**Baseline:** v0 | **Changes:** Prompt improvements, temperature settings, image detail, safety over-flagging fix

**Date:** 2026-03-10

---

## 1.1 Decision Matrix

| Scenario                             | guardrailCheck                                            | mealAnalysis | safetyChecks                                                       | Composite | P50 (ms) |
| ------------------------------------ | --------------------------------------------------------- | ------------ | ------------------------------------------------------------------ | --------- | -------- |
| Best accuracy                        | gpt-5.4, gpt-5.2, gpt-5-mini, gpt-4.1-mini, gpt-5, gpt-4o | gpt-4.1      | gpt-4.1, gpt-5.2, gpt-5-mini, gpt-5.4, gpt-4.1-mini, gpt-4o, gpt-5 | 86.8/100  | 6324     |
| Best value (score per 1k tokens)     | gpt-4o                                                    | gpt-4o       | gpt-4.1-mini, gpt-4o                                               | 85.8/100  | 7877     |
| Best latency                         | gpt-4.1-mini                                              | gpt-4.1      | gpt-4o                                                             | 86.8/100  | 5977     |
| **Balanced (accuracy + latency)**    | gpt-4.1-mini                                              | gpt-4.1      | gpt-4o                                                             | 86.8/100  | 5977     |
| Balanced (accuracy + latency + cost) | gpt-5.4                                                   | gpt-4.1      | gpt-4o                                                             | 86.8/100  | 5987     |

## 1.2 Recommended Architecture

> **Recommended stack** — Balanced (accuracy + latency) across all three agents. Same composite as best-accuracy with faster P50.

| Agent              | Model        | Score     | Rationale                                                                  |
| ------------------ | ------------ | --------- | -------------------------------------------------------------------------- |
| **guardrailCheck** | gpt-4.1-mini | 100.0/100 | Top-tier accuracy with fast P50; gates non-food and PII early              |
| **mealAnalysis**   | gpt-4.1      | 81.2/100  | Best composite for structured output (recommendation, macros, ingredients) |
| **safetyChecks**   | gpt-4o       | 87.5/100  | Tied top score with lowest P50 among top scorers                           |

**Composite eval score:** 86.8/100

**End-to-end latency:** P50 5977 ms | P75 7208 ms | P95 10421 ms | P99 12965 ms

_Key takeaway: This stack matches best-accuracy composite while trading minimal latency for production readiness._

### Key Observations (v1)

1. guardrailCheck improved — 6 models now at 100.0 (gpt-5.4, gpt-5.2, gpt-5-mini, gpt-4.1-mini, gpt-5, gpt-4o) vs v0’s top of 98.6. The safety over-flagging fix appears effective.

2. mealAnalysis is still the bottleneck — Lowest scores (68–81) and highest latency. ingredients_score dropped from 58.9 → 45.2; recommendation and macros are similar. gpt-4.1 remains best for structured output.

3. safetyChecks improved — 7 models at 87.5 (vs 3 in v0). gpt-4.1-mini 71.9 → 87.5; gpt-4o-mini 75.0 → 84.4. Over-flagging fix helped.

4. Composite down 1.0 — 87.8 → 86.8, driven by mealAnalysis (83.7 → 81.2). Gains in guardrailCheck and safetyChecks partly offset this.

5. Latency improved — Balanced P50: 6321 → 5977 ms (~5% faster). Best-latency stack: gpt-4.1-mini + gpt-4.1 + gpt-4o → 86.8 composite, 5977 ms P50.

6. gpt-5.x on mealAnalysis — Still high output tokens and latency (e.g. gpt-5-mini: 4789 avg output, 68s P50). Not cost-effective for this pipeline.

7. Recommended stack — gpt-4.1-mini + gpt-4.1 + gpt-4o matches best-accuracy composite with better latency; gpt-5.4 for guardrailCheck is optional if cost is less important.

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
| **gpt-4.1**  | 81.2/100        | 876              | 233               | 3660     | 4348     | 6586     | 7140     |
| gpt-4o       | 79.2/100        | 876              | 132               | 4691     | 5593     | 7610     | 8703     |
| gpt-4o-mini  | 76.4/100        | 9121             | 139               | 3726     | 4257     | 5632     | 13497    |
| gpt-4.1-mini | 75.7/100        | 1037             | 154               | 3494     | 4043     | 5752     | 7072     |
| gpt-5.4      | 70.8/100        | 928              | 1286              | 16680    | 28182    | 48120    | 68301    |
| gpt-5.2      | 69.0/100        | 928              | 540               | 9367     | 12343    | 16507    | 19948    |
| gpt-5-mini   | 67.8/100        | 928              | 4789              | 68372    | 82579    | 113647   | 167754   |
| gpt-5        | 67.3/100        | 830              | 3478              | 71060    | 86081    | 140484   | 208476   |

### Component breakdown (avg scores, first model)

- **is_food_score:** 100.0/100
- **recommendation_score:** 80.6/100
- **macros_score:** 77.2/100
- **ingredients_score:** 45.2/100
- **text_quality_score:** 95.6/100

## 1.5 safetyChecks

| Model            | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P75 (ms) | P95 (ms) | P99 (ms) |
| ---------------- | ---------- | ---------------- | ----------------- | -------- | -------- | -------- | -------- |
| **gpt-4o**       | 87.5/100   | 620              | 58                | 913      | 1086     | 1531     | 2433     |
| **gpt-4.1**      | 87.5/100   | 620              | 63                | 1250     | 1430     | 2028     | 2350     |
| **gpt-4.1-mini** | 87.5/100   | 620              | 58                | 1416     | 1558     | 2108     | 2562     |
| **gpt-5.2**      | 87.5/100   | 618              | 96                | 1885     | 2047     | 2632     | 3421     |
| **gpt-5.4**      | 87.5/100   | 618              | 109               | 1967     | 2347     | 3018     | 4118     |
| **gpt-5-mini**   | 87.5/100   | 618              | 197               | 2932     | 3406     | 3885     | 4317     |
| **gpt-5**        | 87.5/100   | 618              | 282               | 5522     | 6082     | 7698     | 16496    |
| gpt-4o-mini      | 84.4/100   | 620              | 58                | 1560     | 1810     | 2199     | 2973     |
