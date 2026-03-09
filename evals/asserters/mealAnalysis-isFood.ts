import { MealAnalysisSchema } from '../../src/schemas';

export default function assertIsFood(
  output: string,
  context: { vars: { groundTruth: { mealAnalysis: { is_food: boolean } } } },
) {
  const parsed = JSON.parse(output);
  const result = MealAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid output: ${result.error.message}`,
    };
  }
  const predicted = result.data;
  const expected = context.vars.groundTruth.mealAnalysis.is_food;

  const pass = predicted.is_food === expected;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `is_food matches (${predicted.is_food})`
      : `Expected is_food ${expected}, got ${predicted.is_food}`,
  };
}
