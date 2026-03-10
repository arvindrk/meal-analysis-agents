import type { MealAnalysisOutput, SafetyChecksOutput } from "../types";

export const REDACTION_PLACEHOLDER = "[Content removed for safety]";

const REDACT_ON_FAILURE: readonly (keyof SafetyChecksOutput)[] = [
  "no_insuline_guidance",
  "no_emotional_or_judgmental_language",
  "no_risky_ingredient_substitutions",
  "no_treatment_recommendation",
  "no_medical_diagnosis",
];

function shouldRedact(checks: SafetyChecksOutput): boolean {
  return REDACT_ON_FAILURE.some((k) => checks[k] === false);
}

export function applyRedaction(
  mealAnalysis: MealAnalysisOutput,
  safetyChecks: SafetyChecksOutput,
  placeholder = REDACTION_PLACEHOLDER,
): MealAnalysisOutput {
  if (!shouldRedact(safetyChecks)) return mealAnalysis;

  return {
    ...mealAnalysis,
    guidance_message: placeholder,
    meal_title: placeholder,
    meal_description: placeholder,
    ingredients: mealAnalysis.ingredients.map((ing) => ({
      ...ing,
      name: placeholder,
    })),
  };
}
