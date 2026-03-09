import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from 'promptfoo';
import { MealAnalysisPipeline } from '../../src/pipeline';
import { MealAnalysisEvalVarsSchema } from '../../src/schemas';
import { computeTokenUsage } from './utils';

export default class MealAnalysisProvider implements ApiProvider {
  private pipeline: MealAnalysisPipeline;
  private providerId: string;

  constructor(options: ProviderOptions) {
    const model = (options.config?.model as string) ?? 'gpt-4.1';
    this.pipeline = new MealAnalysisPipeline({
      loadDataset: false,
      models: { guardrail: model, mealAnalysis: model, safety: model },
    });
    this.providerId = options.id ?? `mealAnalysis/${model}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const parseResult = MealAnalysisEvalVarsSchema.safeParse(context?.vars);
    if (!parseResult.success) {
      throw new Error(`Invalid eval vars: ${parseResult.error.message}`);
    }
    const vars = parseResult.data;
    const { mealAnalysis, rawResponses } = await this.pipeline.runMealAnalysis(vars.imagePath);

    return {
      output: JSON.stringify(mealAnalysis),
      tokenUsage: computeTokenUsage(rawResponses),
    };
  }
}
