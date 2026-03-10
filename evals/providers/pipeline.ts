import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from "promptfoo";
import { MealAnalysisPipeline } from "../../src/pipeline";
import { ImageEvalVarsSchema } from "../../src/schemas";
import { resolveAgentConfig } from "./utils";

export default class PipelineProvider implements ApiProvider {
  private readonly pipeline: MealAnalysisPipeline;
  private readonly providerId: string;

  constructor(options: ProviderOptions) {
    const config = options.config ?? {};
    const agents = {
      guardrail: resolveAgentConfig(config.guardrail ?? config),
      mealAnalysis: resolveAgentConfig(config.mealAnalysis ?? config),
      safety: resolveAgentConfig(config.safety ?? config),
    };
    this.pipeline = new MealAnalysisPipeline({
      loadDataset: false,
      agents,
    });
    this.providerId =
      options.id ??
      `pipeline/${agents.guardrail.model ?? "gpt-4.1"}-${agents.mealAnalysis.model ?? "gpt-4.1"}-${agents.safety.model ?? "gpt-4.1"}`;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const parseResult = ImageEvalVarsSchema.safeParse(context?.vars);
    if (!parseResult.success) {
      throw new Error(`Invalid eval vars: ${parseResult.error.message}`);
    }
    const { imageId, imagePath, groundTruth } = parseResult.data;
    const result = await this.pipeline.analyze({
      id: imageId,
      imagePath,
      groundTruth,
    });
    return { output: JSON.stringify(result) };
  }
}
