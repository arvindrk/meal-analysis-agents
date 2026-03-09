import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EVALS_TEST_CASES_DIR = join(ROOT, 'output', 'evals', 'test-cases');
export const EVALS_RESULTS_DIR = join(ROOT, 'output', 'evals', 'results');
