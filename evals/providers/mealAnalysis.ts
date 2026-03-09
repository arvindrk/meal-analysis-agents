import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from 'promptfoo';
import { run } from '@openai/agents';
import { createMealAnalysisAgent } from '../../src/agents/mealAnalysis';
import { buildImageInput } from '../../src/dataset';
import { MealAnalysisEvalVarsSchema } from '../../src/schemas';
import { computeTokenUsage } from './utils';

export default class MealAnalysisProvider implements ApiProvider {
  private model: string;
  private providerId: string;

  constructor(options: ProviderOptions) {
    this.model = (options.config?.model as string) ?? 'gpt-4.1';
    this.providerId = options.id ?? `mealAnalysis/${this.model}`;
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
    const agent = createMealAnalysisAgent(this.model);

    const runResult = await run(agent, buildImageInput(vars.imagePath));

    return {
      output: JSON.stringify(runResult.finalOutput),
      tokenUsage: computeTokenUsage(runResult.rawResponses),
    };
  }
}
