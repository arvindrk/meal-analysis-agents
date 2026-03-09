import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadDatasetWithStats } from '../src/dataset';
import { EVALS_TEST_CASES_DIR } from './constants';

const { entries } = loadDatasetWithStats();

const testCases = entries.map((entry) => ({
  vars: {
    imageId: entry.id,
    imagePath: entry.imagePath,
    groundTruth: entry.groundTruth,
  },
}));

mkdirSync(EVALS_TEST_CASES_DIR, { recursive: true });

const outPath = join(EVALS_TEST_CASES_DIR, 'test-cases.json');
writeFileSync(outPath, JSON.stringify(testCases, null, 2));
console.log(`Generated ${testCases.length} test cases (guardrail + mealAnalysis) → ${outPath}`);
