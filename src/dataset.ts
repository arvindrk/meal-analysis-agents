import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GroundTruth, DatasetEntry } from './types';

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const DEFAULT_DATA_DIR = join(PROJECT_ROOT, 'data');
const DEFAULT_OUTPUT_DIR = join(PROJECT_ROOT, 'output');

export function loadDataset(dataDir = DEFAULT_DATA_DIR): DatasetEntry[] {
  const jsonDir = join(dataDir, 'json-files');
  const imageDir = join(dataDir, 'images');

  return readdirSync(jsonDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = basename(f, '.json');
      const groundTruth: GroundTruth = JSON.parse(
        readFileSync(join(jsonDir, f), 'utf-8'),
      );
      return {
        id,
        imagePath: join(imageDir, groundTruth.fileName),
        groundTruth,
      };
    });
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
