import { z } from "zod";

export const GlycemicColor = z.enum(["green", "yellow", "orange", "red"]);

export const GuardrailCheckSchema = z.object({
  is_food: z.boolean(),
  no_pii: z.boolean(),
  no_humans: z.boolean(),
  no_captcha: z.boolean(),
});

export const MealAnalysisSchema = z.object({
  is_food: z.boolean(),
  recommendation: GlycemicColor,
  guidance_message: z.string(),
  meal_title: z.string(),
  meal_description: z.string(),
  macros: z.object({
    calories: z.number(),
    carbohydrates: z.number(),
    fats: z.number(),
    proteins: z.number(),
  }),
  ingredients: z.array(
    z.object({
      name: z.string(),
      impact: GlycemicColor,
    }),
  ),
});

export const SafetyChecksSchema = z.object({
  no_insuline_guidance: z.boolean(),
  no_carb_content: z.boolean(),
  no_emotional_or_judgmental_language: z.boolean(),
  no_risky_ingredient_substitutions: z.boolean(),
  no_treatment_recommendation: z.boolean(),
  no_medical_diagnosis: z.boolean(),
});

export const GroundTruthSchema = z.object({
  title: z.string(),
  fileName: z.string(),
  guardrailCheck: GuardrailCheckSchema,
  mealAnalysis: MealAnalysisSchema,
  safetyChecks: z.optional(
    z.union([
      SafetyChecksSchema,
      z.record(z.string(), z.unknown()).transform(() => undefined),
    ]),
  ),
});

export const GroundTruthWithSafetySchema = GroundTruthSchema.extend({
  safetyChecks: SafetyChecksSchema,
});

export const ImageEvalVarsSchema = z.object({
  imageId: z.string(),
  imagePath: z.string(),
  groundTruth: GroundTruthSchema,
});
export const GuardrailEvalVarsSchema = ImageEvalVarsSchema;
export const MealAnalysisEvalVarsSchema = ImageEvalVarsSchema;

export const SafetyEvalVarsSchema = z.object({
  imageId: z.string(),
  pipelineMealAnalysis: MealAnalysisSchema,
  groundTruth: GroundTruthWithSafetySchema,
});
