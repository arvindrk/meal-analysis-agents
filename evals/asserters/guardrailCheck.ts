import { GuardrailCheckSchema } from "../../src/schemas";
import type { GuardrailCheckOutput } from "../../src/types";
import { createBooleanAsserter } from "./booleanSchema";

type Ctx = { vars: { groundTruth: { guardrailCheck: GuardrailCheckOutput } } };
export default createBooleanAsserter(
  GuardrailCheckSchema,
  (c) => (c as Ctx).vars.groundTruth.guardrailCheck,
);
