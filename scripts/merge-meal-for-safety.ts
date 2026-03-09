/**
 * Merges mealAnalysis pipeline outputs into safety eval test cases.
 * Run after eval:analysis. Uses MEAL_ANALYSIS_MODEL env var (default: gpt-5.4).
 *
 * Usage:
 *   MEAL_ANALYSIS_MODEL=gpt-5-mini tsx --env-file=.env scripts/merge-meal-for-safety.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EVALS_TEST_CASES_DIR, EVALS_RESULTS_DIR } from './constants';

const MEAL_RESULTS_PATH = join(EVALS_RESULTS_DIR, 'mealAnalysis-results.json');
const TEST_CASES_PATH = join(EVALS_TEST_CASES_DIR, 'test-cases.json');
const OUT_PATH = join(EVALS_TEST_CASES_DIR, 'safetyChecks-test-cases.json');

interface PromptfooResult {
  vars?: { imageId?: string };
  testCase?: { vars?: { imageId?: string } };
  provider?: { label?: string };
  response?: { output?: string };
}

function extractResults(raw: unknown): PromptfooResult[] {
  if (Array.isArray(raw)) return raw as PromptfooResult[];
  const obj = raw as Record<string, unknown>;
  const inner = obj.results as Record<string, unknown> | undefined;
  const arr = (Array.isArray(inner) ? inner : (inner?.results as unknown[] | undefined)) ?? [];
  return arr as PromptfooResult[];
}

function main() {
  const model = process.env.MEAL_ANALYSIS_MODEL ?? 'gpt-5.4';

  if (!existsSync(MEAL_RESULTS_PATH)) {
    console.error(`Missing ${MEAL_RESULTS_PATH}. Run eval:analysis first.`);
    process.exit(1);
  }
  if (!existsSync(TEST_CASES_PATH)) {
    console.error(`Missing ${TEST_CASES_PATH}. Run eval:generate first.`);
    process.exit(1);
  }

  const mealRaw = JSON.parse(readFileSync(MEAL_RESULTS_PATH, 'utf-8'));
  const results = extractResults(mealRaw);

  const byImageAndModel = new Map<string, Record<string, unknown>>();
  for (const r of results) {
    const imageId = r.vars?.imageId ?? r.testCase?.vars?.imageId;
    const label = r.provider?.label;
    const output = r.response?.output;
    if (!imageId || !label || !output) continue;
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      if (!byImageAndModel.has(imageId)) byImageAndModel.set(imageId, {});
      (byImageAndModel.get(imageId) as Record<string, unknown>)[label] = parsed;
    } catch {
      // skip invalid JSON
    }
  }

  const testCases = JSON.parse(readFileSync(TEST_CASES_PATH, 'utf-8')) as Array<{ vars: Record<string, unknown> }>;
  const merged: typeof testCases = [];
  let skippedNoMeal = 0;
  let skippedNoSafety = 0;

  for (const tc of testCases) {
    const groundTruth = tc.vars.groundTruth as { safetyChecks?: unknown } | undefined;
    if (!groundTruth?.safetyChecks) {
      skippedNoSafety++;
      continue;
    }

    const imageId = tc.vars.imageId as string;
    const modelOutputs = byImageAndModel.get(imageId);
    const pipelineMealAnalysis = modelOutputs?.[model] as Record<string, unknown> | undefined;

    if (!pipelineMealAnalysis) {
      skippedNoMeal++;
      continue;
    }

    merged.push({
      vars: {
        ...tc.vars,
        pipelineMealAnalysis,
      },
    });
  }

  mkdirSync(EVALS_TEST_CASES_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(merged, null, 2));
  console.log(
    `Merged ${merged.length} test cases (skipped ${skippedNoMeal} no meal output, ${skippedNoSafety} no safetyChecks) → ${OUT_PATH}`,
  );
  console.log(`Using mealAnalysis model: ${model}`);
}

main();
