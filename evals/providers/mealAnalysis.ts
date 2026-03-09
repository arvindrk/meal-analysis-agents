import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from 'promptfoo';
import { run } from '@openai/agents';
import { createMealAnalysisAgent } from '../../src/agents/mealAnalysis';
import { imageToBase64 } from '../../src/dataset';
import { MealAnalysisEvalVarsSchema } from '../../src/schemas';

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

    const imageInput = [
      {
        role: 'user' as const,
        content: [{ type: 'input_image' as const, image: imageToBase64(vars.imagePath) }],
      },
    ];

    const runResult = await run(agent, imageInput);

    const inputTokens = runResult.rawResponses.reduce((s: number, r) => s + (r.usage?.inputTokens ?? 0), 0);
    const outputTokens = runResult.rawResponses.reduce((s: number, r) => s + (r.usage?.outputTokens ?? 0), 0);

    return {
      output: JSON.stringify(runResult.finalOutput),
      tokenUsage: {
        total: inputTokens + outputTokens,
        prompt: inputTokens,
        completion: outputTokens,
      },
    };
  }
}
