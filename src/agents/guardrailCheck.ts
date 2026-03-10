import { Agent, run } from "@openai/agents";
import { GuardrailCheckSchema } from "../schemas";
import { buildImageInput } from "../agentIO";
import { getModelSettings } from "./modelSettings";
import type {
  GuardrailCheckAgentConfig,
  GuardrailCheckOutput,
  GuardrailCheckResult,
  IAgent,
} from "../types";

const DEFAULT_MODEL = "gpt-4.1";

const INSTRUCTIONS = `You are an image guardrail classifier for a health-tech meal analysis system.

Given an uploaded image, evaluate these four binary checks:

- is_food: true if the image contains food, a meal, or beverages (water, coffee, tea, juice, wine, etc). false if it's a non-food object, scenery, abstract image, etc.
- no_pii: true if the image contains NO personally identifiable information (names, addresses, phone numbers, IDs, etc). false if PII is visible.
- no_humans: true if the image contains NO visible human faces or identifiable people. Hands holding a plate, hands in frame for scale, or partially visible hands do NOT count as human presence. false only if a face or full body is visible.
- no_captcha: true if the image is NOT a captcha or challenge image. false if it is a captcha.

Return ONLY the boolean classification. Do not explain your reasoning.`;

export class GuardrailCheckAgent implements IAgent<
  string,
  GuardrailCheckOutput,
  GuardrailCheckResult
> {
  private readonly agent: Agent;

  constructor(config?: GuardrailCheckAgentConfig) {
    this.agent = new Agent({
      name: "guardrailCheck",
      model: config?.model ?? DEFAULT_MODEL,
      instructions: config?.instructions ?? INSTRUCTIONS,
      outputType: GuardrailCheckSchema,
      modelSettings:
        config?.modelSettings ??
        getModelSettings(config?.model ?? DEFAULT_MODEL, "guardrail"),
    }) as unknown as Agent;
  }

  async executeWithTrace(imagePath: string): Promise<GuardrailCheckResult> {
    const result = await run(this.agent, buildImageInput(imagePath));
    return {
      guardrailCheck: result.finalOutput as unknown as GuardrailCheckOutput,
      rawResponses: result.rawResponses,
    };
  }

  async execute(imagePath: string): Promise<GuardrailCheckOutput> {
    return (await this.executeWithTrace(imagePath)).guardrailCheck;
  }
}
