import { MealAnalysisSchema } from '../../src/schemas';
import type { MealAnalysisMacros } from '../../src/types';

const MACRO_FIELDS: (keyof MealAnalysisMacros)[] = ['calories', 'carbohydrates', 'fats', 'proteins'];

function ape(predicted: number, expected: number): number {
  if (expected === 0) return predicted === 0 ? 0 : 1;
  return Math.abs(predicted - expected) / Math.abs(expected);
}

export default function assertMacros(
  output: string,
  context: { vars: { groundTruth: { mealAnalysis: { macros: MealAnalysisMacros } } } },
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
  const expected = context.vars.groundTruth.mealAnalysis.macros;

  const mapeAvg =
    MACRO_FIELDS.reduce((sum, f) => sum + ape(predicted.macros[f], expected[f]), 0) /
    MACRO_FIELDS.length;

  // score = round(clamp(0,1)(1 - mapeAvg) * 100) / 100  →  back to 0–1 for Promptfoo
  const score = Math.round(Math.max(0, Math.min(1, 1 - mapeAvg)) * 100) / 100;

  return {
    pass: score >= 0.5,
    score,
    reason: `Macro MAPE avg: ${(mapeAvg * 100).toFixed(1)}% → score ${(score * 100).toFixed(0)}/100`,
  };
}
