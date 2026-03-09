/**
 * Reads Promptfoo JSON result files for all three agents, computes per-model
 * stats, and prints the assignment's required results tables plus the overall
 * composite score (guardrails 20% + meal analysis 50% + safety 30%).
 *
 * Usage:
 *   tsx --env-file=.env scripts/score-composite.ts
 *
 * Expected result files (produced by `promptfoo eval --output`):
 *   output/evals/results/guardrailCheck-results.json
 *   output/evals/results/mealAnalysis-results.json
 *   output/evals/results/safetyChecks-results.json
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import boxen from 'boxen';
import chalk from 'chalk';
import { EVALS_RESULTS_DIR } from './constants';

function scoreColor(score: number): (s: string) => string {
  if (score >= 80) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function padVisible(str: string, width: number): string {
  const visible = stripAnsi(String(str)).length;
  return String(str) + ' '.repeat(Math.max(0, width - visible));
}

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
  gradingResult?: { score?: number; componentResults?: ComponentResult[]; namedScores?: Record<string, number> };
  namedScores?: Record<string, number>;
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
  const path = join(EVALS_RESULTS_DIR, filename);
  if (!existsSync(path)) {
    console.warn(chalk.yellow(`  [warn] ${filename} not found — skipping`));
    return [];
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as PromptfooOutput;
  if (Array.isArray(raw)) return raw as EvalResult[];
  const inner = raw.results as EvalResult[] | Record<string, unknown> | undefined;
  const arr = Array.isArray(inner) ? inner : (inner && typeof inner === 'object' && 'results' in inner ? (inner as { results?: EvalResult[] }).results : undefined);
  return arr ?? [];
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

function modelsWithMaxScore(stats: ModelStats[]): { models: ModelStats[]; maxScore: number } {
  if (stats.length === 0) return { models: [], maxScore: 0 };
  const maxScore = Math.max(...stats.map((s) => s.evalScore));
  const models = stats.filter((s) => s.evalScore === maxScore);
  return { models, maxScore };
}

function bestBy<T>(items: T[], scoreFn: (t: T) => number): { items: T[]; metric: number } {
  if (items.length === 0) return { items: [], metric: 0 };
  const withMetric = items.map((t) => ({ item: t, metric: scoreFn(t) }));
  const max = Math.max(...withMetric.map((x) => x.metric));
  const best = withMetric.filter((x) => x.metric === max).map((x) => x.item);
  return { items: best, metric: max };
}

function bestByValue(stats: ModelStats[]): { models: ModelStats[]; metric: number } {
  const r = bestBy(stats, (s) => {
    const tokens = s.avgInputTokens + s.avgOutputTokens;
    return tokens > 0 ? (s.evalScore / tokens) * 1000 : 0;
  });
  return { models: r.items, metric: r.metric };
}

function bestByLatency(stats: ModelStats[]): { models: ModelStats[]; metric: number } {
  const r = bestBy(stats, (s) => (s.p50LatencyMs > 0 ? s.evalScore / s.p50LatencyMs : 0));
  return { models: r.items, metric: r.metric };
}

function bestByBalanced(stats: ModelStats[]): ModelStats[] {
  if (stats.length === 0) return [];
  const valueMetrics = stats.map((s) => {
    const tokens = s.avgInputTokens + s.avgOutputTokens;
    return tokens > 0 ? (s.evalScore / tokens) * 1000 : 0;
  });
  const latencyMetrics = stats.map((s) =>
    s.p50LatencyMs > 0 ? s.evalScore / s.p50LatencyMs : 0,
  );
  const maxV = Math.max(...valueMetrics);
  const maxL = Math.max(...latencyMetrics);
  const minV = Math.min(...valueMetrics);
  const minL = Math.min(...latencyMetrics);
  const rangeV = maxV - minV || 1;
  const rangeL = maxL - minL || 1;
  const combined = stats.map((s, i) => {
    const normV = (valueMetrics[i]! - minV) / rangeV;
    const normL = (latencyMetrics[i]! - minL) / rangeL;
    return { stats: s, score: normV + normL };
  });
  const maxCombined = Math.max(...combined.map((x) => x.score));
  return combined.filter((x) => x.score === maxCombined).map((x) => x.stats);
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

    const componentScores: Record<string, number[]> = {};
    for (const r of rows) {
      const ns = r.namedScores ?? r.gradingResult?.namedScores;
      if (ns) {
        for (const [metric, s] of Object.entries(ns)) {
          if (!componentScores[metric]) componentScores[metric] = [];
          const scaled = metric === 'text_quality_score' ? (s / 5) * 100 : s * 100;
          componentScores[metric].push(scaled);
        }
      } else {
        for (const c of r.gradingResult?.componentResults ?? []) {
          const metric = c.assertion?.metric ?? c.assertion?.type ?? 'unknown';
          if (!componentScores[metric]) componentScores[metric] = [];
          const s = c.score ?? 0;
          const scaled = metric === 'text_quality_score' ? (s / 5) * 100 : s * 100;
          componentScores[metric].push(scaled);
        }
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

// ── mealAnalysis weighted composite (assignment 3.1.3) ─────────────────────
// 50% recommendation exact (100/0) + 30% text (description, guidance, title) + 20% avg(macros, ingredients)
// Normalize weights over available components if any are missing.

function mealAnalysisComposite(stats: ModelStats): number {
  const cs = stats.componentScores;
  const recScores = cs['recommendation_score'] ?? [];
  const textScores = cs['text_quality_score'] ?? [];
  const macrosScores = cs['macros_score'] ?? [];
  const ingrScores = cs['ingredients_score'] ?? [];

  const available: { w: number; v: number }[] = [];
  if (recScores.length > 0) available.push({ w: 0.5, v: mean(recScores) });
  if (textScores.length > 0) available.push({ w: 0.3, v: mean(textScores) });
  const hasMacros = macrosScores.length > 0;
  const hasIngr = ingrScores.length > 0;
  if (hasMacros || hasIngr) {
    const v = hasMacros && hasIngr
      ? (mean(macrosScores) + mean(ingrScores)) / 2
      : hasMacros ? mean(macrosScores) : mean(ingrScores);
    available.push({ w: 0.2, v });
  }

  const totalW = available.reduce((s, x) => s + x.w, 0);
  return totalW > 0 ? available.reduce((s, x) => s + (x.w / totalW) * x.v, 0) : 0;
}

// ── Table printer ────────────────────────────────────────────────────────────

function printTable(
  title: string,
  modelStats: ModelStats[],
  scoreLabel = 'Eval Score',
  bestModels?: Set<string>,
) {
  const cols = ['Model', scoreLabel, 'Avg Input Tokens', 'Avg Output Tokens', 'P50 Latency (ms)'];

  const rows = modelStats.map((s) => {
    const scoreStr = `${fmt(s.evalScore)}/100`;
    const coloredScore = scoreColor(s.evalScore)(scoreStr);
    return [
      s.label,
      coloredScore,
      fmt(s.avgInputTokens, 0),
      fmt(s.avgOutputTokens, 0),
      fmt(s.p50LatencyMs, 0),
    ];
  });

  const widths = cols.map((c, i) =>
    Math.max(c.length, ...rows.map((r) => stripAnsi(String(r[i])).length)),
  );

  const divider = widths.map((w) => '─'.repeat(w + 2)).join('┼');
  const header = cols.map((c, i) => ` ${chalk.bold.dim(padVisible(c, widths[i]!))} `).join('│');

  const body = rows
    .map((row, i) => {
      const line = row.map((c, j) => ` ${padVisible(String(c), widths[j]!)} `).join('│');
      const isBest = bestModels?.has(modelStats[i]!.label);
      return isBest ? chalk.bold(line) : line;
    })
    .join('\n');

  const content = `${divider}\n${header}\n${divider}\n${body}\n${divider}`;
  const minWidth = Math.max(divider.length + 4, 100);

  console.log(
    boxen(content, {
      title: chalk.bold(title),
      titleAlignment: 'left',
      padding: 1,
      borderStyle: 'single',
      borderColor: 'cyan',
      width: minWidth,
    }),
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log(
    boxen(chalk.bold.cyan('Meal Analysis Eval — Composite Scorer'), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    }),
  );
  console.log();

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
    const bestG = new Set(modelsWithMaxScore(guardrailStats).models.map((m) => m.label));
    printTable('guardrailCheck', guardrailStats, 'Eval Score', bestG);
  }

  if (mealStats.length > 0) {
    const bestM = new Set(modelsWithMaxScore(mealStats).models.map((m) => m.label));
    printTable('mealAnalysis (weighted composite)', mealStats, 'Composite Score', bestM);
    const firstModel = mealStats[0]!;
    if (Object.keys(firstModel.componentScores).length > 0) {
      const breakdown = Object.entries(firstModel.componentScores)
        .map(([metric, scores]) => chalk.dim(`  ${metric}: `) + scoreColor(mean(scores))(`${fmt(mean(scores))}/100`))
        .join('\n');
      console.log(boxen(chalk.dim('Component breakdown (avg scores, first model)\n\n') + breakdown, {
        padding: 1,
        borderStyle: 'round',
        dimBorder: true,
      }));
    }
  }

  if (safetyStats.length > 0) {
    const bestS = new Set(modelsWithMaxScore(safetyStats).models.map((m) => m.label));
    printTable('safetyChecks', safetyStats, 'Eval Score', bestS);
  }

  if (guardrailStats.length > 0 && mealStats.length > 0 && safetyStats.length > 0) {
    const { models: bestGuardrails, maxScore: guardrailMax } = modelsWithMaxScore(guardrailStats);
    const { models: bestMeals, maxScore: mealMax } = modelsWithMaxScore(mealStats);
    const { models: bestSafeties, maxScore: safetyMax } = modelsWithMaxScore(safetyStats);

    const composite = 0.2 * guardrailMax + 0.5 * mealMax + 0.3 * safetyMax;

    const allLatencies = [
      bestGuardrails[0]!.p50LatencyMs,
      bestMeals[0]!.p50LatencyMs,
      bestSafeties[0]!.p50LatencyMs,
    ];

    const compositeLines = [
      chalk.dim('(All models tied for best per agent)\n'),
      chalk.cyan('guardrailCheck') + ` → ${bestGuardrails.map((m) => m.label).join(', ')} ` + scoreColor(guardrailMax)(`(${fmt(guardrailMax)}/100)`),
      chalk.cyan('mealAnalysis') + `   → ${bestMeals.map((m) => m.label).join(', ')} ` + scoreColor(mealMax)(`(${fmt(mealMax)}/100)`),
      chalk.cyan('safetyChecks') + `   → ${bestSafeties.map((m) => m.label).join(', ')} ` + scoreColor(safetyMax)(`(${fmt(safetyMax)}/100)`),
      '',
      chalk.bold('Composite eval score: ') + scoreColor(composite)(`${fmt(composite)}/100`),
      chalk.dim(`P50 end-to-end latency: ${fmt(allLatencies.reduce((s, v) => s + v, 0), 0)} ms (sum of agent P50s)`),
    ];

    const compositeWidth = Math.max(80, ...compositeLines.map((l) => stripAnsi(l).length)) + 4;
    console.log(
      boxen(compositeLines.join('\n'), {
        title: chalk.bold('Overall Composite (guardrails 20% + meal 50% + safety 30%)'),
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        width: compositeWidth,
      }),
    );

    const compositeForCombo = (g: ModelStats, m: ModelStats, s: ModelStats) =>
      0.2 * g.evalScore + 0.5 * m.evalScore + 0.3 * s.evalScore;
    const e2eForCombo = (g: ModelStats, m: ModelStats, s: ModelStats) =>
      g.p50LatencyMs + m.p50LatencyMs + s.p50LatencyMs;

    const bestValG = bestByValue(guardrailStats);
    const bestValM = bestByValue(mealStats);
    const bestValS = bestByValue(safetyStats);
    const bestLatG = bestByLatency(guardrailStats);
    const bestLatM = bestByLatency(mealStats);
    const bestLatS = bestByLatency(safetyStats);
    const bestBalG = bestByBalanced(guardrailStats);
    const bestBalM = bestByBalanced(mealStats);
    const bestBalS = bestByBalanced(safetyStats);

    const compA = compositeForCombo(bestValG.models[0]!, bestValM.models[0]!, bestValS.models[0]!);
    const e2eA = e2eForCombo(bestValG.models[0]!, bestValM.models[0]!, bestValS.models[0]!);
    const compB = compositeForCombo(bestLatG.models[0]!, bestLatM.models[0]!, bestLatS.models[0]!);
    const e2eB = e2eForCombo(bestLatG.models[0]!, bestLatM.models[0]!, bestLatS.models[0]!);
    const compAB = compositeForCombo(bestBalG[0]!, bestBalM[0]!, bestBalS[0]!);
    const e2eAB = e2eForCombo(bestBalG[0]!, bestBalM[0]!, bestBalS[0]!);

    const dmCols = ['Scenario', 'guardrailCheck', 'mealAnalysis', 'safetyChecks', 'Composite', 'E2E P50 (ms)'];
    const dmRows = [
      ['Best accuracy', bestGuardrails.map((m) => m.label).join(', '), bestMeals.map((m) => m.label).join(', '), bestSafeties.map((m) => m.label).join(', '), `${fmt(composite)}/100`, `${fmt(allLatencies.reduce((s, v) => s + v, 0), 0)}`],
      ['A: Best value', bestValG.models.map((m) => m.label).join(', '), bestValM.models.map((m) => m.label).join(', '), bestValS.models.map((m) => m.label).join(', '), `${fmt(compA)}/100`, `${fmt(e2eA, 0)}`],
      ['B: Best latency', bestLatG.models.map((m) => m.label).join(', '), bestLatM.models.map((m) => m.label).join(', '), bestLatS.models.map((m) => m.label).join(', '), `${fmt(compB)}/100`, `${fmt(e2eB, 0)}`],
      ['A+B: Balanced', bestBalG.map((m) => m.label).join(', '), bestBalM.map((m) => m.label).join(', '), bestBalS.map((m) => m.label).join(', '), `${fmt(compAB)}/100`, `${fmt(e2eAB, 0)}`],
    ];
    const dmWidths = dmCols.map((c, i) => Math.max(c.length, ...dmRows.map((r) => r[i]!.length)));
    const dmDivider = dmWidths.map((w) => '─'.repeat(w + 2)).join('┼');
    const dmHeader = dmCols.map((c, i) => ` ${chalk.bold.dim(c.padEnd(dmWidths[i]!))} `).join('│');
    const dmBody = dmRows
      .map((row, i) => {
        const line = row.map((c, j) => ` ${c.padEnd(dmWidths[j]!) || ' '.repeat(dmWidths[j]!)} `).join('│');
        return i === 0 ? chalk.bold(line) : line;
      })
      .join('\n');
    const dmContent = `${dmDivider}\n${dmHeader}\n${dmDivider}\n${dmBody}\n${dmDivider}\n\n${chalk.dim('A = composite per 1k tokens (cost)  |  B = composite per ms (latency)  |  A+B = normalized value + latency')}`;
    const dmWidth = Math.max(dmDivider.length + 4, 100);

    console.log(
      boxen(dmContent, {
        title: chalk.bold('Decision Matrix'),
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'single',
        borderColor: 'cyan',
        width: dmWidth,
      }),
    );
  }

  console.log();
}

main();
