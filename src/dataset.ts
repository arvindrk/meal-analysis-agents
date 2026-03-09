import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GroundTruthSchema } from './schemas';
import type { GroundTruth, DatasetEntry, LoadDatasetResult } from './types';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DEFAULT_DATA_DIR = join(PROJECT_ROOT, 'data');

export function loadDataset(dataDir = DEFAULT_DATA_DIR): DatasetEntry[] {
  return loadDatasetWithStats(dataDir).entries;
}

export function loadDatasetWithStats(dataDir = DEFAULT_DATA_DIR): LoadDatasetResult {
  const jsonDir = join(dataDir, 'json-files');
  const imageDir = join(dataDir, 'images');
  const files = readdirSync(jsonDir).filter((f) => f.endsWith('.json'));
  const entries: DatasetEntry[] = [];
  let withSafetyChecks = 0;

  for (const f of files) {
    const id = basename(f, '.json');
    const raw = JSON.parse(readFileSync(join(jsonDir, f), 'utf-8'));
    const result = GroundTruthSchema.safeParse(raw);
    if (!result.success) {
      console.warn(`[dataset] Skipping ${f}: ${result.error.message}`);
      continue;
    }
    const groundTruth: GroundTruth = result.data;
    if (groundTruth.safetyChecks) withSafetyChecks++;
    entries.push({
      id,
      imagePath: join(imageDir, groundTruth.fileName),
      groundTruth,
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[dataset] Loaded ${entries.length}/${files.length} records (${withSafetyChecks} with safetyChecks)`,
    );
  }

  return { entries, total: files.length, withSafetyChecks };
}
