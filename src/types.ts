import type { z } from 'zod';
import type {
  GuardrailCheckSchema,
  MealAnalysisSchema,
  SafetyChecksSchema,
  GroundTruthSchema,
} from './schemas';

export type GuardrailCheckOutput = z.infer<typeof GuardrailCheckSchema>;
export type MealAnalysisOutput = z.infer<typeof MealAnalysisSchema>;
export type SafetyChecksOutput = z.infer<typeof SafetyChecksSchema>;
export type GroundTruth = z.infer<typeof GroundTruthSchema>;

export type GlycemicColor = MealAnalysisOutput['recommendation'];
export type MealAnalysisIngredient = MealAnalysisOutput['ingredients'][number];
export type MealAnalysisMacros = MealAnalysisOutput['macros'];

export interface DatasetEntry {
  id: string;
  imagePath: string;
  groundTruth: GroundTruth;
}

export interface PipelineResult {
  imageId: string;
  guardrailCheck: GuardrailCheckOutput;
  mealAnalysis?: MealAnalysisOutput;
  safetyChecks?: SafetyChecksOutput;
}
