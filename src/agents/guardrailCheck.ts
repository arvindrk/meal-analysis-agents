import { Agent } from '@openai/agents';
import { GuardrailCheckSchema } from '../schemas';

const INSTRUCTIONS = `You are an image guardrail classifier for a health-tech meal analysis system.

Given an uploaded image, evaluate these four binary checks:

- is_food: true if the image contains food or a meal. false if it's a non-food object, scenery, abstract image, etc.
- no_pii: true if the image contains NO personally identifiable information (names, addresses, phone numbers, IDs, etc). false if PII is visible.
- no_humans: true if the image contains NO visible human faces or identifiable people. false if humans are visible.
- no_captcha: true if the image is NOT a captcha or challenge image. false if it is a captcha.

Return ONLY the boolean classification. Do not explain your reasoning.`;

export function createGuardrailAgent(model = 'gpt-4.1') {
  return new Agent({
    name: 'guardrailCheck',
    model,
    instructions: INSTRUCTIONS,
    outputType: GuardrailCheckSchema,
  });
}
