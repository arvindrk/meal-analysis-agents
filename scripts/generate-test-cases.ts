import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDatasetWithStats } from '../src/dataset';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { entries } = loadDatasetWithStats();

const testCases = entries.map((entry) => ({
  vars: {
    imageId: entry.id,
    imagePath: entry.imagePath,
    groundTruth: entry.groundTruth,
  },
}));

mkdirSync(join(ROOT, 'evals'), { recursive: true });

const outPath = join(ROOT, 'evals', 'test-cases.json');
writeFileSync(outPath, JSON.stringify(testCases, null, 2));
console.log(`Generated ${testCases.length} test cases (guardrail + mealAnalysis) → ${outPath}`);
