import type { z } from 'zod';
import type { GuardrailCheckSchema, MealAnalysisSchema, SafetyChecksSchema } from './schemas';

export type GuardrailCheckOutput = z.infer<typeof GuardrailCheckSchema>;
export type MealAnalysisOutput = z.infer<typeof MealAnalysisSchema>;
export type SafetyChecksOutput = z.infer<typeof SafetyChecksSchema>;

export interface GroundTruth {
  title: string;
  fileName: string;
  guardrailCheck: GuardrailCheckOutput;
  safetyChecks: SafetyChecksOutput;
  mealAnalysis: MealAnalysisOutput;
}

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
