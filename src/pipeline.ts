import { run } from "@openai/agents";
import type {
  GuardrailCheckOutput,
  MealAnalysisOutput,
  SafetyChecksOutput,
  DatasetEntry,
  PipelineResult,
  PipelineOptions,
} from "./types";
import { loadDataset } from "./dataset";
import { buildImageInput } from "./agentIO";
import { createGuardrailAgent } from "./agents/guardrailCheck";
import { createMealAnalysisAgent } from "./agents/mealAnalysis";
import { createSafetyAgent } from "./agents/safetyChecks";
import { applyRedaction } from "./redaction";

const DEFAULT_MODEL = "gpt-4.1";

function guardrailsPassed(output: GuardrailCheckOutput): boolean {
  return (
    output.is_food && output.no_pii && output.no_humans && output.no_captcha
  );
}

export class MealAnalysisPipeline {
  readonly dataset: DatasetEntry[];
  private readonly parallel: boolean;
  private guardrailAgent;
  private analysisAgent;
  private safetyAgent;

  constructor(options?: PipelineOptions) {
    const models = options?.models ?? {};
    const guardrailModel = models.guardrail ?? DEFAULT_MODEL;
    const mealAnalysisModel = models.mealAnalysis ?? DEFAULT_MODEL;
    const safetyModel = models.safety ?? DEFAULT_MODEL;

    this.parallel = options?.parallel ?? false;
    this.dataset =
      options?.loadDataset === false ? [] : loadDataset(options?.dataDir);
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
    const result = await run(
      this.analysisAgent,
      buildImageInput(imagePath, { detail: "high" }),
    );
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
    let guardrailCheck: GuardrailCheckOutput;
    let mealAnalysis: MealAnalysisOutput;

    if (this.parallel) {
      const [guardrailResult, mealResult] = await Promise.all([
        this.runGuardrailCheck(entry.imagePath),
        this.runMealAnalysis(entry.imagePath),
      ]);
      guardrailCheck = guardrailResult.guardrailCheck;
      mealAnalysis = mealResult.mealAnalysis;
    } else {
      const guardrailResult = await this.runGuardrailCheck(entry.imagePath);
      guardrailCheck = guardrailResult.guardrailCheck;
      if (!guardrailsPassed(guardrailCheck)) {
        return { imageId: entry.id, guardrailCheck };
      }
      mealAnalysis = (await this.runMealAnalysis(entry.imagePath)).mealAnalysis;
    }

    if (!guardrailsPassed(guardrailCheck)) {
      return { imageId: entry.id, guardrailCheck };
    }

    const { safetyChecks } = await this.runSafetyChecks(mealAnalysis);
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
