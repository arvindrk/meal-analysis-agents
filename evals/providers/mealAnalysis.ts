import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from "promptfoo";
import { MealAnalysisAgent } from "../../src/agents/mealAnalysisAgent";
import { MealAnalysisEvalVarsSchema } from "../../src/schemas";
import { computeTokenUsage, resolveAgentConfig } from "./utils";

export default class MealAnalysisProvider implements ApiProvider {
  private readonly agent: MealAnalysisAgent;
  private readonly providerId: string;

  constructor(options: ProviderOptions) {
    const agentConfig = resolveAgentConfig(options.config);
    this.agent = new MealAnalysisAgent(agentConfig);
    this.providerId =
      options.id ?? `mealAnalysis/${agentConfig.model ?? "gpt-4.1"}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const parseResult = MealAnalysisEvalVarsSchema.safeParse(context?.vars);
    if (!parseResult.success) {
      throw new Error(`Invalid eval vars: ${parseResult.error.message}`);
    }
    const { mealAnalysis, rawResponses } = await this.agent.executeWithTrace(
      parseResult.data.imagePath,
    );

    return {
      output: JSON.stringify(mealAnalysis),
      tokenUsage: computeTokenUsage(rawResponses),
    };
  }
}
