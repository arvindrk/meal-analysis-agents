import { run } from '@openai/agents';
import type {
  GuardrailCheckOutput,
  MealAnalysisOutput,
  SafetyChecksOutput,
  DatasetEntry,
  PipelineResult,
} from './types';
import { loadDataset, buildImageInput } from './dataset';
import { createGuardrailAgent } from './agents/guardrailCheck';
import { createMealAnalysisAgent } from './agents/mealAnalysis';
import { createSafetyAgent } from './agents/safetyChecks';

const DEFAULT_MODEL = 'gpt-4.1';

export interface PipelineOptions {
  dataDir?: string;
  loadDataset?: boolean;
  models?: {
    guardrail?: string;
    mealAnalysis?: string;
    safety?: string;
  };
}

function guardrailsPassed(output: GuardrailCheckOutput): boolean {
  return output.is_food && output.no_pii && output.no_humans && output.no_captcha;
}

export class MealAnalysisPipeline {
  readonly dataset: DatasetEntry[];
  private guardrailAgent;
  private analysisAgent;
  private safetyAgent;

  constructor(options?: PipelineOptions) {
    const models = options?.models ?? {};
    const guardrailModel = models.guardrail ?? DEFAULT_MODEL;
    const mealAnalysisModel = models.mealAnalysis ?? DEFAULT_MODEL;
    const safetyModel = models.safety ?? DEFAULT_MODEL;

    this.dataset = options?.loadDataset === false ? [] : loadDataset(options?.dataDir);
    this.guardrailAgent = createGuardrailAgent(guardrailModel);
    this.analysisAgent = createMealAnalysisAgent(mealAnalysisModel);
    this.safetyAgent = createSafetyAgent(safetyModel);
  }

  async runGuardrailCheck(imagePath: string) {
    const result = await run(this.guardrailAgent, buildImageInput(imagePath));
    return {
      guardrailCheck: result.finalOutput as GuardrailCheckOutput,
      rawResponses: result.rawResponses,
    };
  }

  async runMealAnalysis(imagePath: string) {
    const result = await run(this.analysisAgent, buildImageInput(imagePath));
    return {
      mealAnalysis: result.finalOutput as MealAnalysisOutput,
      rawResponses: result.rawResponses,
    };
  }

  async runSafetyChecks(mealAnalysis: MealAnalysisOutput) {
    const result = await run(this.safetyAgent, JSON.stringify(mealAnalysis));
    return {
      safetyChecks: result.finalOutput as SafetyChecksOutput,
      rawResponses: result.rawResponses,
    };
  }

  async analyze(entry: DatasetEntry): Promise<PipelineResult> {
    const { guardrailCheck } = await this.runGuardrailCheck(entry.imagePath);

    if (!guardrailsPassed(guardrailCheck)) {
      return { imageId: entry.id, guardrailCheck };
    }

    const { mealAnalysis } = await this.runMealAnalysis(entry.imagePath);
    const { safetyChecks } = await this.runSafetyChecks(mealAnalysis);

    return { imageId: entry.id, guardrailCheck, mealAnalysis, safetyChecks };
  }

  async analyzeAll(n?: number): Promise<PipelineResult[]> {
    const entries = n ? this.dataset.slice(0, n) : this.dataset;
    const results: PipelineResult[] = [];

    for (let i = 0; i < entries.length; i++) {
      console.log(`[${i + 1}/${entries.length}] ${entries[i].id}`);
      results.push(await this.analyze(entries[i]));
    }

    return results;
  }
}
