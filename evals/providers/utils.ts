export function computeTokenUsage(
  rawResponses: Array<{ usage?: { inputTokens?: number; outputTokens?: number } }>,
) {
  const prompt = rawResponses.reduce((s, r) => s + (r.usage?.inputTokens ?? 0), 0);
  const completion = rawResponses.reduce((s, r) => s + (r.usage?.outputTokens ?? 0), 0);
  return { total: prompt + completion, prompt, completion };
}
