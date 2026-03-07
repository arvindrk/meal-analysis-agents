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

function guardrailsPassed(output: GuardrailCheckOutput): boolean {
  return output.is_food && output.no_pii && output.no_humans && output.no_captcha;
}

export class MealAnalysisPipeline {
  readonly dataset: DatasetEntry[];
  private guardrailAgent = createGuardrailAgent();
  private analysisAgent = createMealAnalysisAgent();
  private safetyAgent = createSafetyAgent();

  constructor(dataDir?: string) {
    this.dataset = loadDataset(dataDir);
  }

  async runGuardrailCheck(entry: DatasetEntry): Promise<GuardrailCheckOutput> {
    const result = await run(this.guardrailAgent, buildImageInput(entry.imagePath));
    return result.finalOutput as GuardrailCheckOutput;
  }

  async runMealAnalysis(entry: DatasetEntry): Promise<MealAnalysisOutput> {
    const result = await run(this.analysisAgent, buildImageInput(entry.imagePath));
    return result.finalOutput as MealAnalysisOutput;
  }

  async runSafetyChecks(mealAnalysis: MealAnalysisOutput): Promise<SafetyChecksOutput> {
    const result = await run(this.safetyAgent, JSON.stringify(mealAnalysis));
    return result.finalOutput as SafetyChecksOutput;
  }

  async analyze(entry: DatasetEntry): Promise<PipelineResult> {
    const guardrailCheck = await this.runGuardrailCheck(entry);

    if (!guardrailsPassed(guardrailCheck)) {
      return { imageId: entry.id, guardrailCheck };
    }

    const mealAnalysis = await this.runMealAnalysis(entry);
    const safetyChecks = await this.runSafetyChecks(mealAnalysis);

    return { imageId: entry.id, guardrailCheck, mealAnalysis, safetyChecks };
  }

  async analyzeAll(n?: number): Promise<PipelineResult[]> {
    const entries = n ? this.dataset.slice(0, n) : this.dataset;
    const results: PipelineResult[] = [];

    for (const entry of entries) {
      console.log(`[${results.length + 1}/${entries.length}] ${entry.id}`);
      results.push(await this.analyze(entry));
    }

    return results;
  }
}
