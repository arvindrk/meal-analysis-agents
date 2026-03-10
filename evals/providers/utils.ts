import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentConfig } from "../../src/types";
import type { ModelSettings } from "@openai/agents";

const EVALS_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

export function resolveAgentConfig(
  config: Record<string, unknown> | undefined,
): AgentConfig {
  const instructions = config?.instructions as string | undefined;
  return {
    model: config?.model as string | undefined,
    modelSettings: config?.modelSettings as ModelSettings | undefined,
    instructions: instructions?.startsWith("file://")
      ? readFileSync(resolve(EVALS_ROOT, instructions.slice(7)), "utf-8")
      : instructions,
  };
}

export function computeTokenUsage(
  rawResponses: Array<{
    usage?: { inputTokens?: number; outputTokens?: number };
  }>,
) {
  const prompt = rawResponses.reduce(
    (s, r) => s + (r.usage?.inputTokens ?? 0),
    0,
  );
  const completion = rawResponses.reduce(
    (s, r) => s + (r.usage?.outputTokens ?? 0),
    0,
  );
  return { total: prompt + completion, prompt, completion };
}
