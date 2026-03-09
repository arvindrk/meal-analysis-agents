import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GroundTruthSchema } from './schemas';
import type { GroundTruth, DatasetEntry } from './types';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DEFAULT_DATA_DIR = join(PROJECT_ROOT, 'data');
const DEFAULT_OUTPUT_DIR = join(PROJECT_ROOT, 'output', 'pipeline');

export interface LoadDatasetResult {
  entries: DatasetEntry[];
  total: number;
  withSafetyChecks: number;
}

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
    const groundTruth = result.data;
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

export function imageToBase64(imagePath: string): string {
  const buf = readFileSync(imagePath);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

export function buildImageInput(imagePath: string) {
  return [
    {
      role: 'user' as const,
      content: [{ type: 'input_image' as const, image: imageToBase64(imagePath) }],
    },
  ];
}

export function writeAgentOutput(
  agentName: string,
  id: string,
  output: unknown,
  outputDir = DEFAULT_OUTPUT_DIR,
): void {
  const dir = join(outputDir, agentName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(output, null, 2));
}

export function readAgentOutput<T>(
  agentName: string,
  id: string,
  outputDir = DEFAULT_OUTPUT_DIR,
): T {
  const filePath = join(outputDir, agentName, `${id}.json`);
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing ${agentName} output for ${id}. Run --agent ${agentName} first.`,
    );
  }
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}
