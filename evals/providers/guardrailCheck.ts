import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from "promptfoo";
import { GuardrailCheckAgent } from "../../src/agents/guardrailCheckAgent";
import { GuardrailEvalVarsSchema } from "../../src/schemas";
import { computeTokenUsage, resolveAgentConfig } from "./utils";

export default class GuardrailCheckProvider implements ApiProvider {
  private readonly agent: GuardrailCheckAgent;
  private readonly providerId: string;

  constructor(options: ProviderOptions) {
    const agentConfig = resolveAgentConfig(options.config);
    this.agent = new GuardrailCheckAgent(agentConfig);
    this.providerId =
      options.id ?? `guardrailCheck/${agentConfig.model ?? "gpt-4.1"}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const parseResult = GuardrailEvalVarsSchema.safeParse(context?.vars);
    if (!parseResult.success) {
      throw new Error(`Invalid eval vars: ${parseResult.error.message}`);
    }
    const { guardrailCheck, rawResponses } = await this.agent.executeWithTrace(
      parseResult.data.imagePath,
    );

    return {
      output: JSON.stringify(guardrailCheck),
      tokenUsage: computeTokenUsage(rawResponses),
    };
  }
}
