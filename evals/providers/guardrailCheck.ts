import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from 'promptfoo';
import { run } from '@openai/agents';
import { createGuardrailAgent } from '../../src/agents/guardrailCheck';
import { buildImageInput } from '../../src/dataset';
import { GuardrailEvalVarsSchema } from '../../src/schemas';
import { computeTokenUsage } from './utils';

export default class GuardrailCheckProvider implements ApiProvider {
  private model: string;
  private providerId: string;

  constructor(options: ProviderOptions) {
    this.model = (options.config?.model as string) ?? 'gpt-4.1';
    this.providerId = options.id ?? `guardrailCheck/${this.model}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const parseResult = GuardrailEvalVarsSchema.safeParse(context?.vars);
    if (!parseResult.success) {
      throw new Error(`Invalid eval vars: ${parseResult.error.message}`);
    }
    const vars = parseResult.data;
    const agent = createGuardrailAgent(this.model);

    const runResult = await run(agent, buildImageInput(vars.imagePath));

    return {
      output: JSON.stringify(runResult.finalOutput),
      tokenUsage: computeTokenUsage(runResult.rawResponses),
    };
  }
}
