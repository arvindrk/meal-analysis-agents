/**
 * Reads Promptfoo JSON result files for all three agents, computes per-model
 * stats, and prints the assignment's required results tables plus the overall
 * composite score (guardrails 20% + meal analysis 50% + safety 30%).
 *
 * Usage:
 *   tsx --env-file=.env scripts/score-composite.ts
 *
 * Expected result files (produced by `promptfoo eval --output`):
 *   output/evals/guardrailCheck-results.json
 *   output/evals/mealAnalysis-results.json
 *   output/evals/safetyChecks-results.json
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Types ────────────────────────────────────────────────────────────────────

interface TokenUsage {
  total?: number;
  prompt?: number;
  completion?: number;
}

interface ComponentResult {
  assertion?: { metric?: string; type?: string };
  score?: number;
  pass?: boolean;
}

interface EvalResult {
  provider?: { id?: string; label?: string };
  response?: { output?: string; tokenUsage?: TokenUsage };
  gradingResult?: { score?: number; componentResults?: ComponentResult[] };
  latencyMs?: number;
  score?: number;
}

interface PromptfooOutput {
  results?: EvalResult[];
  // Promptfoo v3 wraps results under a nested key in some versions
  [key: string]: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadResults(filename: string): EvalResult[] {
  const path = join(ROOT, 'output', 'evals', filename);
  if (!existsSync(path)) {
    console.warn(`  [warn] ${filename} not found — skipping`);
    return [];
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as PromptfooOutput;
  if (Array.isArray(raw)) return raw as EvalResult[];
  const inner = raw.results as EvalResult[] | Record<string, unknown> | undefined;
  return (Array.isArray(inner) ? inner : (inner?.results as EvalResult[] | undefined)) ?? [];
}

function p50(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.5)] ?? sorted[sorted.length - 1]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

// ── Per-model stats ──────────────────────────────────────────────────────────

interface ModelStats {
  label: string;
  evalScore: number;       // 0–100
  avgInputTokens: number;
  avgOutputTokens: number;
  p50LatencyMs: number;
  componentScores: Record<string, number[]>; // metric → [scores]
}

function groupByModel(results: EvalResult[]): ModelStats[] {
  const groups = new Map<string, EvalResult[]>();

  for (const r of results) {
    const label = r.provider?.label ?? r.provider?.id ?? 'unknown';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }

  return [...groups.entries()].map(([label, rows]) => {
    const scores = rows.map((r) => (r.score ?? r.gradingResult?.score ?? 0) * 100);
    const inputTokens = rows.map((r) => r.response?.tokenUsage?.prompt ?? 0);
    const outputTokens = rows.map((r) => r.response?.tokenUsage?.completion ?? 0);
    const latencies = rows.map((r) => r.latencyMs ?? 0);

    // Collect per-metric component scores
    const componentScores: Record<string, number[]> = {};
    for (const r of rows) {
      for (const c of r.gradingResult?.componentResults ?? []) {
        const metric = c.assertion?.metric ?? c.assertion?.type ?? 'unknown';
        if (!componentScores[metric]) componentScores[metric] = [];
        componentScores[metric].push((c.score ?? 0) * 100);
      }
    }

    return {
      label,
      evalScore: mean(scores),
      avgInputTokens: mean(inputTokens),
      avgOutputTokens: mean(outputTokens),
      p50LatencyMs: p50(latencies),
      componentScores,
    };
  });
}

// ── mealAnalysis weighted composite ─────────────────────────────────────────
// 50% recommendation + 30% text_quality + 10% macros + 10% ingredients

function mealAnalysisComposite(stats: ModelStats): number {
  const cs = stats.componentScores;
  const rec = mean(cs['recommendation_score'] ?? [stats.evalScore]);
  const textScores = cs['text_quality_score'] ?? [];
  const text = mean(textScores);
  const macros = mean(cs['macros_score'] ?? []);
  const ingr = mean(cs['ingredients_score'] ?? []);

  const available = [
    textScores.length === 0 ? null : { w: 0.3, v: text },
    { w: 0.5, v: rec },
    { w: 0.1, v: macros },
    { w: 0.1, v: ingr },
  ].filter(Boolean) as { w: number; v: number }[];

  const totalW = available.reduce((s, x) => s + x.w, 0);
  return available.reduce((s, x) => s + (x.w / totalW) * x.v, 0);
}

// ── Table printer ────────────────────────────────────────────────────────────

function printTable(title: string, modelStats: ModelStats[], scoreLabel = 'Eval Score') {
  const cols = ['Model', scoreLabel, 'Avg Input Tokens', 'Avg Output Tokens', 'P50 Latency (ms)'];
  const rows = modelStats.map((s) => [
    s.label,
    `${fmt(s.evalScore)}/100`,
    fmt(s.avgInputTokens, 0),
    fmt(s.avgOutputTokens, 0),
    fmt(s.p50LatencyMs, 0),
  ]);

  const widths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i]!.length)));

  const divider = widths.map((w) => '-'.repeat(w + 2)).join('+');
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join('|');

  console.log(`\n### ${title}`);
  console.log(divider);
  console.log(header);
  console.log(divider);
  for (const row of rows) {
    console.log(row.map((c, i) => ` ${c.padEnd(widths[i]!)} `).join('|'));
  }
  console.log(divider);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Meal Analysis Eval — Composite Scorer ===\n');

  const guardrailResults = loadResults('guardrailCheck-results.json');
  const mealResults = loadResults('mealAnalysis-results.json');
  const safetyResults = loadResults('safetyChecks-results.json');

  const guardrailStats = groupByModel(guardrailResults);
  const mealStats = groupByModel(mealResults);
  const safetyStats = groupByModel(safetyResults);

  // Override mealAnalysis evalScore with the assignment's weighted composite
  for (const s of mealStats) {
    s.evalScore = mealAnalysisComposite(s);
  }

  if (guardrailStats.length > 0) {
    printTable('guardrailCheck', guardrailStats);
  }

  if (mealStats.length > 0) {
    printTable('mealAnalysis (weighted composite)', mealStats, 'Composite Score');
    // Show component breakdown
    const firstModel = mealStats[0]!;
    if (Object.keys(firstModel.componentScores).length > 0) {
      console.log('\n  Component breakdown (avg scores, first model):');
      for (const [metric, scores] of Object.entries(firstModel.componentScores)) {
        console.log(`    ${metric}: ${fmt(mean(scores))}/100`);
      }
    }
  }

  if (safetyStats.length > 0) {
    printTable('safetyChecks', safetyStats);
  }

  // ── Overall composite (20/50/30) for each recommended-model combination ──
  if (guardrailStats.length > 0 && mealStats.length > 0 && safetyStats.length > 0) {
    console.log('\n### Overall Composite (guardrails 20% + meal 50% + safety 30%)');
    console.log('(Best model per agent shown)\n');

    const bestGuardrail = guardrailStats.reduce((a, b) => (a.evalScore > b.evalScore ? a : b));
    const bestMeal = mealStats.reduce((a, b) => (a.evalScore > b.evalScore ? a : b));
    const bestSafety = safetyStats.reduce((a, b) => (a.evalScore > b.evalScore ? a : b));

    const composite =
      0.2 * bestGuardrail.evalScore + 0.5 * bestMeal.evalScore + 0.3 * bestSafety.evalScore;

    const allLatencies = [
      bestGuardrail.p50LatencyMs,
      bestMeal.p50LatencyMs,
      bestSafety.p50LatencyMs,
    ];

    console.log(`  guardrailCheck → ${bestGuardrail.label} (${fmt(bestGuardrail.evalScore)}/100)`);
    console.log(`  mealAnalysis   → ${bestMeal.label} (${fmt(bestMeal.evalScore)}/100)`);
    console.log(`  safetyChecks   → ${bestSafety.label} (${fmt(bestSafety.evalScore)}/100)`);
    console.log(`\n  Composite eval score : ${fmt(composite)}/100`);
    console.log(`  P50 end-to-end latency: ${fmt(allLatencies.reduce((s, v) => s + v, 0), 0)} ms (sum of agent P50s)`);
  }

  console.log('');
}

main();
