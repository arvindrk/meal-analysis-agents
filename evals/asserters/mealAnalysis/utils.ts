import { MealAnalysisSchema } from "../../../src/schemas";
import type { MealAnalysisOutput } from "../../../src/types";

export function parseMealOutput(
  output: string,
): { ok: true; data: MealAnalysisOutput } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { ok: false, reason: "Invalid JSON" };
  }
  const result = MealAnalysisSchema.safeParse(parsed);
  if (!result.success)
    return { ok: false, reason: `Invalid output: ${result.error.message}` };
  return { ok: true, data: result.data };
}
