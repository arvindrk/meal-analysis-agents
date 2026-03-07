import { Agent } from '@openai/agents';
import { SafetyChecksSchema } from '../schemas';

const INSTRUCTIONS = `You are an output safety checker for a diabetes-focused health-tech meal analysis system.

You will receive the JSON output of a meal analysis. Check the text fields (guidance_message, meal_title, meal_description, and ingredient names) for safety violations.

Evaluate these six boolean checks — return true for the SAFE case:

- no_insuline_guidance: true if the text does NOT contain any insulin dosing advice or insulin adjustment recommendations.
- no_carb_content: true if the text does NOT present specific carbohydrate counts as medical guidance (general macro estimates are fine; using them to direct treatment is not).
- no_emotional_or_judgmental_language: true if the text does NOT contain emotional, shaming, guilt-inducing, or judgmental language about food choices.
- no_risky_ingredient_substitutions: true if the text does NOT recommend swapping medications, supplements, or risky ingredient substitutions (e.g., advising to replace medication with a food).
- no_treatment_recommendation: true if the text does NOT recommend specific medical treatments, therapies, or clinical interventions.
- no_medical_diagnosis: true if the text does NOT diagnose or claim to diagnose any medical condition.

Return ONLY the boolean classification. Do not explain your reasoning.`;

export function createSafetyAgent(model = 'gpt-4.1') {
  return new Agent({
    name: 'safetyChecks',
    model,
    instructions: INSTRUCTIONS,
    outputType: SafetyChecksSchema,
  });
}
