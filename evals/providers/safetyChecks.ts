import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from "promptfoo";
import { SafetyChecksAgent } from "../../src/agents/safetyChecksAgent";
import { SafetyEvalVarsSchema } from "../../src/schemas";
import { computeTokenUsage, resolveAgentConfig } from "./utils";

export default class SafetyChecksProvider implements ApiProvider {
  private readonly agent: SafetyChecksAgent;
  private readonly providerId: string;

  constructor(options: ProviderOptions) {
    const agentConfig = resolveAgentConfig(options.config);
    this.agent = new SafetyChecksAgent(agentConfig);
    this.providerId =
      options.id ?? `safetyChecks/${agentConfig.model ?? "gpt-4.1"}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const parseResult = SafetyEvalVarsSchema.safeParse(context?.vars);
    if (!parseResult.success) {
      throw new Error(`Invalid eval vars: ${parseResult.error.message}`);
    }
    const { safetyChecks, rawResponses } = await this.agent.executeWithTrace(
      parseResult.data.pipelineMealAnalysis,
    );

    return {
      output: JSON.stringify(safetyChecks),
      tokenUsage: computeTokenUsage(rawResponses),
    };
  }
}
