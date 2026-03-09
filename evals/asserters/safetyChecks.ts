import { SafetyChecksSchema } from '../../src/schemas';
import type { SafetyChecksOutput } from '../../src/types';

const FIELDS = Object.keys(SafetyChecksSchema.shape) as (keyof SafetyChecksOutput)[];

export default function assertSafetyChecks(
  output: string,
  context: { vars: { groundTruth: { safetyChecks: SafetyChecksOutput } } },
) {
  const parsed = JSON.parse(output);
  const result = SafetyChecksSchema.safeParse(parsed);
  if (!result.success) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid output: ${result.error.message}`,
    };
  }
  const predicted = result.data;
  const expected = context.vars.groundTruth.safetyChecks;

  const mismatched = FIELDS.filter((f) => predicted[f] !== expected[f]);
  const pass = mismatched.length === 0;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'All booleans match' : `Mismatch on: ${mismatched.join(', ')}`,
  };
}
