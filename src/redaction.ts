import type { MealAnalysisOutput, SafetyChecksOutput } from "./types";

const PLACEHOLDER = "[Content removed for safety]";

const REDACT_GUIDANCE = [
  "no_insuline_guidance",
  "no_carb_content",
  "no_emotional_or_judgmental_language",
  "no_risky_ingredient_substitutions",
  "no_treatment_recommendation",
  "no_medical_diagnosis",
] as const;

const REDACT_TITLE_DESC = [
  "no_emotional_or_judgmental_language",
  "no_medical_diagnosis",
] as const;

const REDACT_INGREDIENT_NAMES = [
  "no_emotional_or_judgmental_language",
  "no_risky_ingredient_substitutions",
] as const;

function shouldRedact(
  checks: SafetyChecksOutput,
  keys: readonly (keyof SafetyChecksOutput)[],
): boolean {
  return keys.some((k) => checks[k] === false);
}

export function applyRedaction(
  mealAnalysis: MealAnalysisOutput,
  safetyChecks: SafetyChecksOutput,
  placeholder = PLACEHOLDER,
): MealAnalysisOutput {
  const redactGuidance = shouldRedact(safetyChecks, REDACT_GUIDANCE);
  const redactTitleDesc = shouldRedact(safetyChecks, REDACT_TITLE_DESC);
  const redactIngredientNames = shouldRedact(
    safetyChecks,
    REDACT_INGREDIENT_NAMES,
  );

  if (!redactGuidance && !redactTitleDesc && !redactIngredientNames) {
    return mealAnalysis;
  }

  return {
    ...mealAnalysis,
    ...(redactGuidance && { guidance_message: placeholder }),
    ...(redactTitleDesc && {
      meal_title: placeholder,
      meal_description: placeholder,
    }),
    ...(redactIngredientNames && {
      ingredients: mealAnalysis.ingredients.map((ing) => ({
        ...ing,
        name: placeholder,
      })),
    }),
  };
}
