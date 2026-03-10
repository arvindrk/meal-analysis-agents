import type { z } from "zod";
import type { ModelResponse, ModelSettings } from "@openai/agents";
import type {
  GuardrailCheckSchema,
  MealAnalysisSchema,
  SafetyChecksSchema,
  GroundTruthSchema,
} from "./schemas";

export type AgentConfig = {
  model?: string;
  instructions?: string;
  modelSettings?: ModelSettings;
};

export interface IAgent<
  TInput,
  TOutput,
  TResult extends { rawResponses: ModelResponse[] },
> {
  execute(input: TInput): Promise<TOutput>;
  executeWithTrace(input: TInput): Promise<TResult>;
}

export type GuardrailCheckAgentConfig = AgentConfig;
export type MealAnalysisAgentConfig = AgentConfig;
export type SafetyChecksAgentConfig = AgentConfig;

export type GuardrailCheckOutput = z.infer<typeof GuardrailCheckSchema>;
export type MealAnalysisOutput = z.infer<typeof MealAnalysisSchema>;
export type SafetyChecksOutput = z.infer<typeof SafetyChecksSchema>;
export type GroundTruth = z.infer<typeof GroundTruthSchema>;

export type GuardrailCheckResult = {
  guardrailCheck: GuardrailCheckOutput;
  rawResponses: ModelResponse[];
};

export type MealAnalysisResult = {
  mealAnalysis: MealAnalysisOutput;
  rawResponses: ModelResponse[];
};

export type SafetyChecksResult = {
  safetyChecks: SafetyChecksOutput;
  rawResponses: ModelResponse[];
};

export type GlycemicColor = MealAnalysisOutput["recommendation"];
export type MealAnalysisIngredient = MealAnalysisOutput["ingredients"][number];
export type MealAnalysisMacros = MealAnalysisOutput["macros"];

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

export interface PipelineOptions {
  dataDir?: string;
  loadDataset?: boolean;
  parallel?: boolean;
  agents?: {
    guardrail?: GuardrailCheckAgentConfig;
    mealAnalysis?: MealAnalysisAgentConfig;
    safety?: SafetyChecksAgentConfig;
  };
}

export interface LoadDatasetResult {
  entries: DatasetEntry[];
  total: number;
  withSafetyChecks: number;
}
