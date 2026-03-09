import { parseMealOutput } from './utils';

export default function assertIsFood(
  output: string,
  context: { vars: { groundTruth: { mealAnalysis: { is_food: boolean } } } },
) {
  const parsed = parseMealOutput(output);
  if (!parsed.ok) return { pass: false, score: 0, reason: parsed.reason };
  const { data: predicted } = parsed;
  const expected = context.vars.groundTruth.mealAnalysis.is_food;
  const pass = predicted.is_food === expected;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? `is_food matches (${predicted.is_food})` : `Expected is_food ${expected}, got ${predicted.is_food}`,
  };
}
