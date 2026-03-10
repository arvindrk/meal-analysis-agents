import { Agent, run } from "@openai/agents";
import { MealAnalysisSchema } from "../schemas";
import { buildImageInput } from "../agentIO";
import { getModelSettings } from "./modelSettings";
import type {
  IAgent,
  MealAnalysisAgentConfig,
  MealAnalysisOutput,
  MealAnalysisResult,
} from "../types";

const DEFAULT_MODEL = "gpt-4.1";

const INSTRUCTIONS = `## Role
You are a meal analysis agent for a diabetes-focused health app. Analyze the image and output structured JSON.

Glycemic index (GI) measures how quickly carbohydrates raise blood sugar. Low GI (≤55) = gradual rise; high GI (≥70) = rapid spike.

## Output Fields

1. is_food: true if the image shows food, a meal, or beverages (water, coffee, tea, juice, wine, etc); false for non-food (objects, scenery, documents, etc.).

2. ingredients: List every visible ingredient. Use specific names (e.g. "Refined wheat flour" not "flour", "White rice" not "rice"). Use parentheticals for variants: "Pasta (rigatoni or ziti)". Group related items: "Cooked root vegetables (carrots, peas, potatoes)". Examples: "Refined wheat flour", "Green peas", "Chapati (wheat flatbread)", "Cream sauce (milk/cheese/butter)". Assign glycemic impact: green (low GI), yellow (medium), orange/red (high).

3. macros: Estimate for the visible portion only. calories (kcal), carbohydrates (g), fats (g), proteins (g). Base estimates on identified ingredients and typical portion sizes. Typical single-plate meal: 250–450 kcal, 25–55g carbs. Adjust for visible portion size.

4. recommendation: Aggregate from ingredients. green = mostly low-GI; yellow = mixed; orange/red = mostly high-GI or refined carbs dominant. Glycemic: green = low-GI (legumes, non-starchy veggies, lean protein); yellow = medium (whole grains, some fruits); orange/red = high (refined flour, white rice, sugar). For mixed meals, weight by carb prominence.

5. meal_title: Concise name (e.g. "Balanced Veggie Plate").
6. meal_description: Brief factual description of what is visible.
7. guidance_message: Neutral, factual guidance. No emotional language, medical claims, diagnoses, or treatment advice.

## Constraints
- Never reference insulin, dosing, or medication.
- Keep guidance informational only.`;

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
