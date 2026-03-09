import { GuardrailCheckSchema } from '../../src/schemas';
import type { GuardrailCheckOutput } from '../../src/types';

const FIELDS = Object.keys(GuardrailCheckSchema.shape) as (keyof GuardrailCheckOutput)[];

export default function assertGuardrailCheck(
  output: string,
  context: { vars: { groundTruth: { guardrailCheck: GuardrailCheckOutput } } },
) {
  const parsed = JSON.parse(output);
  const result = GuardrailCheckSchema.safeParse(parsed);
  if (!result.success) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid output: ${result.error.message}`,
    };
  }
  const predicted = result.data;
  const expected = context.vars.groundTruth.guardrailCheck;

  const mismatched = FIELDS.filter((f) => predicted[f] !== expected[f]);
  const pass = mismatched.length === 0;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'All booleans match' : `Mismatch on: ${mismatched.join(', ')}`,
  };
}
