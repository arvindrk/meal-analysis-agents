import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from 'promptfoo';
import { run } from '@openai/agents';
import { createSafetyAgent } from '../../src/agents/safetyChecks';
import { SafetyEvalVarsSchema } from '../../src/schemas';
import { computeTokenUsage } from './utils';

export default class SafetyChecksProvider implements ApiProvider {
  private model: string;
  private providerId: string;

  constructor(options: ProviderOptions) {
    this.model = (options.config?.model as string) ?? 'gpt-4.1';
    this.providerId = options.id ?? `safetyChecks/${this.model}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const parseResult = SafetyEvalVarsSchema.safeParse(context?.vars);
    if (!parseResult.success) {
      throw new Error(`Invalid eval vars: ${parseResult.error.message}`);
    }
    const vars = parseResult.data;
    const agent = createSafetyAgent(this.model);

    const mealAnalysisText = JSON.stringify(vars.pipelineMealAnalysis);
    const runResult = await run(agent, mealAnalysisText);

    return {
      output: JSON.stringify(runResult.finalOutput),
      tokenUsage: computeTokenUsage(runResult.rawResponses),
    };
  }
}
