const GPT5_PATTERN = /^gpt-5/i;

export type AgentName = 'guardrail' | 'mealAnalysis' | 'safety';

export function getModelSettings(model: string, agent?: AgentName) {
  const isReasoningModel = GPT5_PATTERN.test(model);

  if (!isReasoningModel) {
    return { temperature: 0 };
  }

  if (agent === 'mealAnalysis') {
    return { reasoning: { effort: 'medium' as const } };
  }

  return { reasoning: { effort: 'low' as const } };
}
