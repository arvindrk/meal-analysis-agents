import type { z } from "zod";

export function createBooleanAsserter<T extends Record<string, boolean>>(
  schema: z.ZodType<T> & { shape?: Record<string, unknown> },
  getExpected: (context: { vars: Record<string, unknown> }) => T,
) {
  const fields = schema.shape
    ? (Object.keys(schema.shape) as (keyof T)[])
    : null;

  return (output: string, context: { vars: Record<string, unknown> }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return { pass: false, score: 0, reason: `Invalid JSON: ${output.slice(0, 100)}` };
    }
    const result = schema.safeParse(parsed);
    if (!result.success)
      return {
        pass: false,
        score: 0,
        reason: `Invalid: ${result.error.message}`,
      };
    const expected = getExpected(context);
    const keys = fields ?? (Object.keys(result.data) as (keyof T)[]);
    const mismatched = keys.filter((f) => result.data[f] !== expected[f]);
    return {
      pass: mismatched.length === 0,
      score: mismatched.length === 0 ? 1 : 0,
      reason:
        mismatched.length === 0
          ? "All match"
          : `Mismatch: ${mismatched.join(", ")}`,
    };
  };
}
