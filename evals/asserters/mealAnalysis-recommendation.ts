import { MealAnalysisSchema } from '../../src/schemas';
import type { GlycemicColor } from '../../src/types';

function normalize(color: GlycemicColor): string {
  return color === 'orange' ? 'red' : color;
}

export default function assertRecommendation(
  output: string,
  context: { vars: { groundTruth: { mealAnalysis: { recommendation: GlycemicColor } } } },
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
  const expected = context.vars.groundTruth.mealAnalysis.recommendation;

  const pass = normalize(predicted.recommendation) === normalize(expected);

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `Recommendation matches (${predicted.recommendation})`
      : `Expected ${expected}, got ${predicted.recommendation}`,
  };
}
