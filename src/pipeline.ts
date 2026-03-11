import type {
  GuardrailCheckOutput,
  GuardrailCheckResult,
  MealAnalysisOutput,
  MealAnalysisResult,
  SafetyChecksOutput,
  SafetyChecksResult,
  DatasetEntry,
  PipelineResult,
  PipelineOptions,
  IAgent,
} from "./types";
import { loadDataset } from "./dataset";
import { GuardrailCheckAgent } from "./agents/guardrailCheckAgent";
import { MealAnalysisAgent } from "./agents/mealAnalysisAgent";
import { SafetyChecksAgent } from "./agents/safetyChecksAgent";
import { applyRedaction } from "./utils/redaction";

function guardrailsPassed(output: GuardrailCheckOutput): boolean {
  return (
    output.is_food && output.no_pii && output.no_humans && output.no_captcha
  );
}

export class MealAnalysisPipeline {
  readonly dataset: DatasetEntry[];
  readonly guardrailAgent: IAgent<
    string,
    GuardrailCheckOutput,
    GuardrailCheckResult
  >;
  readonly mealAnalysisAgent: IAgent<
    string,
    MealAnalysisOutput,
    MealAnalysisResult
  >;
  readonly safetyAgent: IAgent<
    MealAnalysisOutput,
    SafetyChecksOutput,
    SafetyChecksResult
  >;
  private readonly parallel: boolean;

  constructor(options?: PipelineOptions) {
    const agentConfigs = options?.agents ?? {};
    this.parallel = options?.parallel ?? false;
    this.dataset =
      options?.loadDataset === false ? [] : loadDataset(options?.dataDir);
    this.guardrailAgent = new GuardrailCheckAgent(agentConfigs.guardrail);
    this.mealAnalysisAgent = new MealAnalysisAgent(agentConfigs.mealAnalysis);
    this.safetyAgent = new SafetyChecksAgent(agentConfigs.safety);
  }

  analyze(entry: DatasetEntry): Promise<PipelineResult> {
    return this.parallel
      ? this.analyzeParallel(entry)
      : this.analyzeSequential(entry);
  }

  private async analyzeSequential(
    entry: DatasetEntry,
  ): Promise<PipelineResult> {
    const guardrailCheck = await this.guardrailAgent.execute(entry.imagePath);
    if (!guardrailsPassed(guardrailCheck)) {
      return { imageId: entry.id, guardrailCheck };
    }

    const mealAnalysis = await this.mealAnalysisAgent.execute(entry.imagePath);
    const safetyChecks = await this.safetyAgent.execute(mealAnalysis);
    const redactedMeal = applyRedaction(mealAnalysis, safetyChecks);

    return {
      imageId: entry.id,
      guardrailCheck,
      mealAnalysis: redactedMeal,
      safetyChecks,
    };
  }

  private async analyzeParallel(entry: DatasetEntry): Promise<PipelineResult> {
    const [guardrailCheck, mealAnalysis] = await Promise.all([
      this.guardrailAgent.execute(entry.imagePath),
      this.mealAnalysisAgent.execute(entry.imagePath),
    ]);

    if (!guardrailsPassed(guardrailCheck)) {
      return { imageId: entry.id, guardrailCheck };
    }

    const safetyChecks = await this.safetyAgent.execute(mealAnalysis);
    const redactedMeal = applyRedaction(mealAnalysis, safetyChecks);

    return {
      imageId: entry.id,
      guardrailCheck,
      mealAnalysis: redactedMeal,
      safetyChecks,
    };
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
