import type { MealAnalysisIngredient } from '../../../src/types';
import { parseMealOutput } from './utils';

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

export default function assertIngredients(
  output: string,
  context: { vars: { groundTruth: { mealAnalysis: { ingredients: MealAnalysisIngredient[] } } } },
) {
  const parsed = parseMealOutput(output);
  if (!parsed.ok) return { pass: false, score: 0, reason: parsed.reason };
  const { data: predicted } = parsed;
  const expected = context.vars.groundTruth.mealAnalysis.ingredients.filter((i) => i.name.trim());
  if (expected.length === 0) return { pass: true, score: 1, reason: 'No expected ingredients to match' };
  let matched = 0;
  for (const exp of expected) {
    const found = predicted.ingredients.some(
      (pred) => namesMatch(pred.name, exp.name) && pred.impact === exp.impact,
    );
    if (found) matched++;
  }
  const score = Math.round((matched / expected.length) * 100) / 100;
  return {
    pass: score >= 0.5,
    score,
    reason: `Matched ${matched}/${expected.length} ingredients → score ${(score * 100).toFixed(0)}/100`,
  };
}
