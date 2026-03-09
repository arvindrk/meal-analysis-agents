# Meal Analysis Evaluation Report (v0)

**Baseline:** v0 | **Changes:** Baseline Snapshot - 3 (Serial) Agent Architecture with Eval Pipeline

**Date:** 2026-03-09

---

## 1.1 Decision Matrix

| Scenario                             | guardrailCheck   | mealAnalysis | safetyChecks           | Composite | P50 (ms) |
| ------------------------------------ | ---------------- | ------------ | ---------------------- | --------- | -------- |
| Best accuracy                        | gpt-5.4, o4-mini | gpt-4.1      | gpt-4.1, gpt-4o, gpt-5 | 87.8/100  | 6787     |
| Best value (score per 1k tokens)     | gpt-4o           | gpt-4o       | gpt-4o                 | 83.1/100  | 6919     |
| Best latency                         | gpt-5.2          | gpt-4.1-nano | gpt-4o                 | 76.6/100  | 4586     |
| **Balanced (accuracy + latency)**    | gpt-5.4          | gpt-4.1      | gpt-4o                 | 87.8/100  | 6321     |
| Balanced (accuracy + latency + cost) | gpt-5.2          | gpt-4.1      | gpt-4o                 | 87.5/100  | 6085     |

## 1.2 Recommended Architecture

> **Recommended stack** — Balanced (accuracy + latency) across all three agents. Same composite as best-accuracy with faster P50.

| Agent              | Model   | Score    | Rationale                                                                  |
| ------------------ | ------- | -------- | -------------------------------------------------------------------------- |
| **guardrailCheck** | gpt-5.4 | 98.6/100 | Top-tier accuracy with fast P50; gates non-food and PII early              |
| **mealAnalysis**   | gpt-4.1 | 83.7/100 | Best composite for structured output (recommendation, macros, ingredients) |
| **safetyChecks**   | gpt-4o  | 87.5/100 | Tied top score with lowest P50 among top scorers                           |

**Composite eval score:** 87.8/100

**End-to-end latency:** P50 6321 ms | P75 7813 ms | P95 11250 ms | P99 24930 ms

_Key takeaway: This stack matches best-accuracy composite while trading minimal latency for production readiness._

### 3.4 Key Observations

1. **mealAnalysis is the bottleneck** — Lowest scores (61–84) and highest latency. Recommendation and macros/ingredients drive most failures; text quality (LLM-as-judge) is high across models.

2. **gpt-4.1 leads mealAnalysis** — Outperforms gpt-5.x on structured output; likely better at schema adherence and numeric estimation.

3. **guardrailCheck and safetyChecks** — Most models score 85+. gpt-5.4/o4-mini for guardrails; gpt-4o for safety (chosen over gpt-4.1/gpt-5 for best P50 among top scorers).

4. **Latency vs accuracy** — Balanced (accuracy + latency): gpt-5.4 + gpt-4.1 + gpt-4o → 87.8 composite, ~6,321 ms P50 (≈7% faster). Cost-optimized: gpt-5.2 + gpt-4.1 + gpt-4o → 87.5 composite, ~6,085 ms P50 (≈10% faster). Best-latency combo (gpt-5.2 + gpt-4.1-nano + gpt-4o) drops to 76.6 composite at ~4,586 ms.

5. **Nano/mini models** — Higher output tokens and latency for reasoning-heavy tasks; not cost-effective for this pipeline.

---

## 1.3 guardrailCheck

| Model        | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P75 (ms) | P95 (ms) | P99 (ms) |
| ------------ | ---------- | ---------------- | ----------------- | -------- | -------- | -------- | -------- |
| **gpt-5.4**  | 98.6/100   | 518              | 32                | 1311     | 1394     | 2239     | 3215     |
| **o4-mini**  | 98.6/100   | 652              | 144               | 2332     | 2635     | 3251     | 3977     |
| gpt-5.2      | 97.2/100   | 518              | 32                | 1075     | 1171     | 1911     | 3011     |
| gpt-4.1-mini | 97.2/100   | 627              | 26                | 1274     | 1519     | 2279     | 12794    |
| gpt-4o-mini  | 97.2/100   | 8711             | 26                | 1899     | 2515     | 3716     | 7894     |
| gpt-5        | 95.8/100   | 420              | 231               | 4675     | 5861     | 10979    | 18828    |
| gpt-5-mini   | 94.4/100   | 518              | 163               | 2969     | 3552     | 4605     | 8807     |
| gpt-4o       | 94.4/100   | 466              | 26                | 1558     | 1905     | 2559     | 3268     |
| gpt-4.1      | 93.1/100   | 466              | 29                | 1539     | 1989     | 3101     | 3798     |
| gpt-5-nano   | 90.3/100   | 594              | 358               | 3971     | 4974     | 7572     | 12345    |
| gpt-4.1-nano | 86.1/100   | 842              | 26                | 1368     | 1508     | 2352     | 3641     |

## 1.4 mealAnalysis (weighted composite)

| Model        | Composite Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P75 (ms) | P95 (ms) | P99 (ms) |
| ------------ | --------------- | ---------------- | ----------------- | -------- | -------- | -------- | -------- |
| **gpt-4.1**  | 83.7/100        | 655              | 219               | 3917     | 4993     | 7021     | 8769     |
| gpt-4o       | 75.9/100        | 655              | 132               | 4268     | 4916     | 6397     | 7039     |
| gpt-4o-mini  | 75.6/100        | 8900             | 139               | 3538     | 3963     | 6133     | 9041     |
| o4-mini      | 74.9/100        | 841              | 962               | 7877     | 9728     | 13524    | 16858    |
| gpt-4.1-mini | 74.7/100        | 816              | 149               | 3390     | 3827     | 4784     | 10284    |
| gpt-5.2      | 73.8/100        | 707              | 208               | 4096     | 5001     | 5951     | 6627     |
| gpt-5.4      | 73.6/100        | 707              | 179               | 3934     | 4583     | 6075     | 8474     |
| gpt-5-mini   | 70.0/100        | 707              | 1138              | 15313    | 19472    | 26246    | 29508    |
| gpt-5        | 69.6/100        | 609              | 1382              | 25109    | 36839    | 53758    | 99710    |
| gpt-5-nano   | 64.2/100        | 783              | 2018              | 21187    | 23444    | 32117    | 35577    |
| gpt-4.1-nano | 61.8/100        | 1031             | 136               | 2418     | 2773     | 3376     | 3796     |

### Component breakdown (avg scores, first model)

- **is_food_score:** 100.0/100
- **recommendation_score:** 81.9/100
- **macros_score:** 77.5/100
- **ingredients_score:** 58.9/100
- **text_quality_score:** 96.9/100

## 1.5 safetyChecks

| Model        | Eval Score | Avg Input Tokens | Avg Output Tokens | P50 (ms) | P75 (ms) | P95 (ms) | P99 (ms) |
| ------------ | ---------- | ---------------- | ----------------- | -------- | -------- | -------- | -------- |
| **gpt-4.1**  | 87.5/100   | 525              | 63                | 1559     | 1822     | 2833     | 7526     |
| **gpt-4o**   | 87.5/100   | 525              | 58                | 1093     | 1426     | 1990     | 12946    |
| **gpt-5**    | 87.5/100   | 523              | 695               | 10407    | 12550    | 24548    | 29201    |
| gpt-5.4      | 85.9/100   | 523              | 64                | 1587     | 1884     | 2281     | 3237     |
| gpt-5.2      | 84.4/100   | 523              | 64                | 1351     | 1579     | 2917     | 4782     |
| gpt-5-mini   | 84.4/100   | 523              | 615               | 10652    | 12884    | 14947    | 16355    |
| o4-mini      | 81.3/100   | 523              | 570               | 5766     | 7433     | 8995     | 17806    |
| gpt-4o-mini  | 75.0/100   | 525              | 58                | 1717     | 1979     | 2617     | 4461     |
| gpt-4.1-mini | 71.9/100   | 525              | 58                | 1509     | 1763     | 2849     | 4023     |
| gpt-4.1-nano | 71.9/100   | 525              | 58                | 1260     | 1469     | 2092     | 2503     |
| gpt-5-nano   | 65.6/100   | 523              | 1188              | 10061    | 11261    | 12709    | 15034    |
