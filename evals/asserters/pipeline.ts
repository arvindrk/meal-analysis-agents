import { z } from "zod";
import {
  applyRedaction,
  REDACTION_PLACEHOLDER,
} from "../../src/utils/redaction";
import type {
  GuardrailCheckOutput,
  MealAnalysisOutput,
  SafetyChecksOutput,
} from "../../src/types";
import { PipelineResultSchema } from "../../src/schemas";

type Ctx = {
  vars: {
    groundTruth: {
      guardrailCheck: GuardrailCheckOutput;
      mealAnalysis?: MealAnalysisOutput;
      safetyChecks?: SafetyChecksOutput;
    };
  };
};

function scoreShortCircuit(
  actual: z.infer<typeof PipelineResultSchema>,
  expectedShortCircuit: boolean,
): number {
  return expectedShortCircuit === (actual.mealAnalysis === undefined) ? 1 : 0;
}

function scoreRedaction(
  actual: MealAnalysisOutput,
  gt: { mealAnalysis: MealAnalysisOutput; safetyChecks: SafetyChecksOutput },
): number {
  const expected = applyRedaction(gt.mealAnalysis, gt.safetyChecks);
  const redactableFields = [
    "guidance_message",
    "meal_title",
    "meal_description",
  ] as const;
  const fieldChecks = redactableFields.map(
    (f) =>
      (actual[f] === REDACTION_PLACEHOLDER) ===
      (expected[f] === REDACTION_PLACEHOLDER),
  );
  const ingredientCheck = actual.ingredients.every(
    (ing, i) =>
      (ing.name === REDACTION_PLACEHOLDER) ===
      (expected.ingredients[i]?.name === REDACTION_PLACEHOLDER),
  );
  const correct = [...fieldChecks, ingredientCheck].filter(Boolean).length;
  return Math.round((correct / (fieldChecks.length + 1)) * 100) / 100;
}

export default function assertPipeline(output: string, context: Ctx) {
  const parseResult = PipelineResultSchema.safeParse(JSON.parse(output));
  if (!parseResult.success) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid PipelineResult: ${parseResult.error.message}`,
      namedScores: { short_circuit_score: 0, redaction_score: 0 },
    };
  }

  const actual = parseResult.data;
  const gt = context.vars.groundTruth;
  const expectedShortCircuit = !(
    gt.guardrailCheck.is_food &&
    gt.guardrailCheck.no_pii &&
    gt.guardrailCheck.no_humans &&
    gt.guardrailCheck.no_captcha
  );

  const shortCircuitScore = scoreShortCircuit(actual, expectedShortCircuit);
  const redactionScore =
    !expectedShortCircuit &&
    actual.mealAnalysis &&
    gt.mealAnalysis &&
    gt.safetyChecks
      ? scoreRedaction(actual.mealAnalysis, {
          mealAnalysis: gt.mealAnalysis,
          safetyChecks: gt.safetyChecks,
        })
      : 1;

  const avgScore =
    Math.round(((shortCircuitScore + redactionScore) / 2) * 100) / 100;

  return {
    pass: avgScore >= 0.8,
    score: avgScore,
    reason: `pipeline=${avgScore} [short_circuit=${shortCircuitScore} redaction=${redactionScore}]`,
    namedScores: {
      short_circuit_score: shortCircuitScore,
      redaction_score: redactionScore,
    },
  };
}
