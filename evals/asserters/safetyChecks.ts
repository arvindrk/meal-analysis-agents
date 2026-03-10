import { SafetyChecksSchema } from "../../src/schemas";
import type { SafetyChecksOutput } from "../../src/types";
import { createBooleanAsserter } from "./booleanSchema";

type Ctx = { vars: { groundTruth: { safetyChecks: SafetyChecksOutput } } };
export default createBooleanAsserter(
  SafetyChecksSchema,
  (c) => (c as Ctx).vars.groundTruth.safetyChecks,
);
