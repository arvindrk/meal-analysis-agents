import { Agent, run } from "@openai/agents";
import { MealAnalysisSchema } from "../schemas";
import { buildImageInput } from "../utils/agentIO";
import { getModelSettings } from "../utils/modelSettings";
import type {
  IAgent,
  MealAnalysisAgentConfig,
  MealAnalysisOutput,
  MealAnalysisResult,
} from "../types";

const DEFAULT_MODEL = "gpt-4.1";

const INSTRUCTIONS = `You are a meal analysis agent for a diabetes-focused health-tech application.

Given a meal image, produce a structured JSON analysis:

- is_food: true if the image contains food, false otherwise.
- recommendation: Classify the overall meal as "green" (diabetes-friendly), "yellow" (moderate caution), "orange" (significant caution), or "red" (not recommended for diabetics).
- guidance_message: A neutral, factual guidance message about the meal's suitability for people with diabetes. Do NOT use emotional or judgmental language. Do NOT make medical claims, diagnose conditions, or recommend treatments or medication changes.
- meal_title: A concise name for the meal.
- meal_description: A brief factual description of what is visible in the image.
- macros: Estimated macronutrients for the visible portion — calories (kcal), carbohydrates (g), fats (g), proteins (g). Provide your best numeric estimates.
- ingredients: A list of identified ingredients, each with a name and glycemic impact classification ("green", "yellow", "orange", or "red").

Keep guidance neutral and informational. Never reference insulin dosing, specific medical treatments, or make diagnostic statements.`;

export class MealAnalysisAgent implements IAgent<
  string,
  MealAnalysisOutput,
  MealAnalysisResult
> {
  private readonly agent: Agent;

  constructor(config?: MealAnalysisAgentConfig) {
    this.agent = new Agent({
      name: "mealAnalysis",
      model: config?.model ?? DEFAULT_MODEL,
      instructions: config?.instructions ?? INSTRUCTIONS,
      outputType: MealAnalysisSchema,
      modelSettings:
        config?.modelSettings ??
        getModelSettings(config?.model ?? DEFAULT_MODEL, "mealAnalysis"),
    }) as unknown as Agent;
  }

  async executeWithTrace(imagePath: string): Promise<MealAnalysisResult> {
    const result = await run(
      this.agent,
      buildImageInput(imagePath, { detail: "high" }),
    );
    return {
      mealAnalysis: result.finalOutput as unknown as MealAnalysisOutput,
      rawResponses: result.rawResponses,
    };
  }

  async execute(imagePath: string): Promise<MealAnalysisOutput> {
    return (await this.executeWithTrace(imagePath)).mealAnalysis;
  }
}
