import type { GlycemicColor } from '../../../src/types';
import { parseMealOutput } from './utils';

function normalize(color: GlycemicColor): string {
  return color === 'orange' ? 'red' : color;
}

export default function assertRecommendation(
  output: string,
  context: { vars: { groundTruth: { mealAnalysis: { recommendation: GlycemicColor } } } },
) {
  const parsed = parseMealOutput(output);
  if (!parsed.ok) return { pass: false, score: 0, reason: parsed.reason };
  const { data: predicted } = parsed;
  const expected = context.vars.groundTruth.mealAnalysis.recommendation;
  const pass = normalize(predicted.recommendation) === normalize(expected);
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? `Recommendation matches (${predicted.recommendation})` : `Expected ${expected}, got ${predicted.recommendation}`,
  };
}
