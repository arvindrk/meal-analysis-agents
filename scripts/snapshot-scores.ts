/**
 * Captures eval score output and writes to a versioned meal eval report.
 * Usage: npm run eval:score:snapshot -- v2 "Phase 1: image detail, temp=0, glycemic rules"
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './constants.js';

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_REGEX, '');
}

function main() {
  const args = process.argv.slice(2);
  const version = args[0] ?? 'v2';
  const changes = args[1] ?? '';

  const result = spawnSync('npx', ['tsx', '--env-file=.env', 'scripts/score-composite.ts'], {
    cwd: ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  if (result.error) {
    console.error('Failed to run score-composite:', result.error);
    process.exit(1);
  }

  const output = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (result.status !== 0) {
    console.error(stderr);
    process.exit(result.status ?? 1);
  }

  const date = new Date().toISOString().slice(0, 10);
  const header = [
    `# Meal Analysis Evaluation Report (${version})`,
    '',
    `**Baseline:** v1 | **Changes:** ${changes || '(see commit history)'}`,
    '',
    `**Date:** ${date}`,
    '',
    '---',
    '',
  ].join('\n');

  const body = stripAnsi(output);
  const reportsDir = join(ROOT, 'output', 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, `meal-eval-report-${version}.md`);
  writeFileSync(reportPath, header + body, 'utf-8');
  console.log(`Wrote ${reportPath}`);
}

main();
