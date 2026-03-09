/**
 * Reads Promptfoo JSON result files for all three agents, computes per-model
 * stats, and prints results tables plus the overall composite score
 * (guardrails 20% + meal analysis 50% + safety 30%).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import boxen from 'boxen';
import chalk from 'chalk';
import { EVALS_RESULTS_DIR } from './constants';

const WEIGHT_GUARDRAIL = 0.2;
const WEIGHT_MEAL = 0.5;
const WEIGHT_SAFETY = 0.3;

const MEAL_REC_WEIGHT = 0.5;
const MEAL_TEXT_WEIGHT = 0.3;
const MEAL_MACROS_INGR_WEIGHT = 0.2;

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
  [key: string]: unknown; // Promptfoo v3 wraps results under nested key in some versions
}

function loadResults(filename: string): EvalResult[] {
  const path = join(EVALS_RESULTS_DIR, filename);
  if (!existsSync(path)) {
    console.warn(chalk.yellow(`  [warn] ${filename} not found — skipping`));
    return [];
  }
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as PromptfooOutput | EvalResult[];
  if (Array.isArray(raw)) return raw;
  const inner = raw.results;
  if (Array.isArray(inner)) return inner;
  const nested = inner && typeof inner === 'object' && 'results' in inner ? (inner as { results?: EvalResult[] }).results : undefined;
  return nested ?? [];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx] ?? sorted[sorted.length - 1]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

function compositeForCombo(g: ModelStats, m: ModelStats, s: ModelStats): number {
  return WEIGHT_GUARDRAIL * g.evalScore + WEIGHT_MEAL * m.evalScore + WEIGHT_SAFETY * s.evalScore;
}

function e2eP50ForCombo(g: ModelStats, m: ModelStats, s: ModelStats): number {
  return g.p50LatencyMs + m.p50LatencyMs + s.p50LatencyMs;
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

function bestByBalancedAccuracyLatency(stats: ModelStats[]): ModelStats[] {
  if (stats.length === 0) return [];
  const scores = stats.map((s) => s.evalScore);
  const latencies = stats.map((s) => s.p50LatencyMs);
  const rangeS = Math.max(...scores) - Math.min(...scores) || 1;
  const rangeL = Math.max(...latencies) - Math.min(...latencies) || 1;
  const minS = Math.min(...scores);
  const maxL = Math.max(...latencies);
  const combined = stats.map((s, i) => {
    const normS = (scores[i]! - minS) / rangeS;
    const normL = (maxL - latencies[i]!) / rangeL;
    return { stats: s, score: normS + normL };
  });
  const maxCombined = Math.max(...combined.map((x) => x.score));
  return combined.filter((x) => x.score === maxCombined).map((x) => x.stats);
}

function bestByBalancedAllThree(stats: ModelStats[]): ModelStats[] {
  if (stats.length === 0) return [];
  const scoreMetrics = stats.map((s) => s.evalScore);
  const valueMetrics = stats.map((s) => {
    const tokens = s.avgInputTokens + s.avgOutputTokens;
    return tokens > 0 ? (s.evalScore / tokens) * 1000 : 0;
  });
  const latencyMetrics = stats.map((s) =>
    s.p50LatencyMs > 0 ? s.evalScore / s.p50LatencyMs : 0,
  );
  const [minS, maxS] = [Math.min(...scoreMetrics), Math.max(...scoreMetrics)];
  const [minV, maxV] = [Math.min(...valueMetrics), Math.max(...valueMetrics)];
  const [minL, maxL] = [Math.min(...latencyMetrics), Math.max(...latencyMetrics)];
  const rangeS = maxS - minS || 1;
  const rangeV = maxV - minV || 1;
  const rangeL = maxL - minL || 1;
  const combined = stats.map((s, i) => {
    const normS = (scoreMetrics[i]! - minS) / rangeS;
    const normV = (valueMetrics[i]! - minV) / rangeV;
    const normL = (latencyMetrics[i]! - minL) / rangeL;
    return { stats: s, score: normS + normV + normL };
  });
  const maxCombined = Math.max(...combined.map((x) => x.score));
  return combined.filter((x) => x.score === maxCombined).map((x) => x.stats);
}

interface ModelStats {
  label: string;
  evalScore: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  p50LatencyMs: number;
  p75LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  componentScores: Record<string, number[]>;
}

function groupByModel(results: EvalResult[]): ModelStats[] {
  const groups = new Map<string, EvalResult[]>();

  for (const r of results) {
    const label = r.provider?.label ?? r.provider?.id ?? 'unknown';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }

  const result = [...groups.entries()].map(([label, rows]) => {
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
      p50LatencyMs: percentile(latencies, 0.5),
      p75LatencyMs: percentile(latencies, 0.75),
      p95LatencyMs: percentile(latencies, 0.95),
      p99LatencyMs: percentile(latencies, 0.99),
      componentScores,
    };
  });
  return result;
}

function sortByScoreDesc(stats: ModelStats[]): ModelStats[] {
  return [...stats].sort((a, b) => b.evalScore - a.evalScore);
}

// 50% rec + 30% text + 20% avg(macros, ingredients); normalize if components missing
function mealAnalysisComposite(stats: ModelStats): number {
  const cs = stats.componentScores;
  const recScores = cs['recommendation_score'] ?? [];
  const textScores = cs['text_quality_score'] ?? [];
  const macrosScores = cs['macros_score'] ?? [];
  const ingrScores = cs['ingredients_score'] ?? [];

  const available: { w: number; v: number }[] = [];
  if (recScores.length > 0) available.push({ w: MEAL_REC_WEIGHT, v: mean(recScores) });
  if (textScores.length > 0) available.push({ w: MEAL_TEXT_WEIGHT, v: mean(textScores) });
  const hasMacros = macrosScores.length > 0;
  const hasIngr = ingrScores.length > 0;
  if (hasMacros || hasIngr) {
    const v = hasMacros && hasIngr
      ? (mean(macrosScores) + mean(ingrScores)) / 2
      : hasMacros ? mean(macrosScores) : mean(ingrScores);
    available.push({ w: MEAL_MACROS_INGR_WEIGHT, v });
  }

  const totalW = available.reduce((s, x) => s + x.w, 0);
  return totalW > 0 ? available.reduce((s, x) => s + (x.w / totalW) * x.v, 0) : 0;
}

function printTable(
  title: string,
  modelStats: ModelStats[],
  scoreLabel = 'Eval Score',
  bestModels?: Set<string>,
) {
  const cols = ['Model', scoreLabel, 'Avg Input Tokens', 'Avg Output Tokens', 'P50 (ms)', 'P75 (ms)', 'P95 (ms)', 'P99 (ms)'];

  const rows = modelStats.map((s) => {
    const scoreStr = `${fmt(s.evalScore)}/100`;
    const coloredScore = scoreColor(s.evalScore)(scoreStr);
    return [
      s.label,
      coloredScore,
      fmt(s.avgInputTokens, 0),
      fmt(s.avgOutputTokens, 0),
      fmt(s.p50LatencyMs, 0),
      fmt(s.p75LatencyMs, 0),
      fmt(s.p95LatencyMs, 0),
      fmt(s.p99LatencyMs, 0),
    ];
  });

  const baseWidths = cols.map((c, i) =>
    Math.max(c.length, ...rows.map((r) => stripAnsi(String(r[i])).length)),
  );
  const latencyColIndices = [4, 5, 6, 7];
  const widths = baseWidths.map((w, i) =>
    latencyColIndices.includes(i) ? Math.max(w, 6) : w,
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
  const minWidth = Math.max(divider.length + 12, 120);

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

function printGridTable(
  title: string,
  cols: string[],
  rows: string[][],
  opts?: { boldFromRow?: number },
) {
  const baseWidths = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => stripAnsi(String(r[i])).length)));
  const widths = baseWidths.map((w, i) => (i === cols.length - 1 ? Math.max(w, 6) : w));
  const divider = widths.map((w) => '─'.repeat(w + 2)).join('┼');
  const header = cols.map((c, i) => ` ${chalk.bold.dim((c.padEnd(widths[i]!)))} `).join('│');
  const body = rows
    .map((row, i) => {
      const line = row.map((c, j) => ` ${(c.padEnd(widths[j]!) || ' '.repeat(widths[j]!))} `).join('│');
      return opts?.boldFromRow !== undefined && i >= opts.boldFromRow ? chalk.bold(line) : line;
    })
    .join('\n');
  const content = `${divider}\n${header}\n${divider}\n${body}\n${divider}`;
  const minWidth = Math.max(divider.length + 12, 120);
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
  const mealStatsRaw = groupByModel(mealResults);
  const mealStats = mealStatsRaw.map((s) => ({ ...s, evalScore: mealAnalysisComposite(s) }));
  const safetyStats = groupByModel(safetyResults);

  const bestG = modelsWithMaxScore(guardrailStats);
  const bestM = modelsWithMaxScore(mealStats);
  const bestS = modelsWithMaxScore(safetyStats);
  const { models: bestGuardrails, maxScore: guardrailMax } = bestG;
  const { models: bestMeals, maxScore: mealMax } = bestM;
  const { models: bestSafeties, maxScore: safetyMax } = bestS;

  if (guardrailStats.length > 0 && mealStats.length > 0 && safetyStats.length > 0) {
    const composite = WEIGHT_GUARDRAIL * guardrailMax + WEIGHT_MEAL * mealMax + WEIGHT_SAFETY * safetyMax;
    const g0 = first(bestGuardrails), m0 = first(bestMeals), s0 = first(bestSafeties);
    const e2eP50 = g0 && m0 && s0 ? g0.p50LatencyMs + m0.p50LatencyMs + s0.p50LatencyMs : 0;
    const e2eP75 = g0 && m0 && s0 ? g0.p75LatencyMs + m0.p75LatencyMs + s0.p75LatencyMs : 0;
    const e2eP95 = g0 && m0 && s0 ? g0.p95LatencyMs + m0.p95LatencyMs + s0.p95LatencyMs : 0;
    const e2eP99 = g0 && m0 && s0 ? g0.p99LatencyMs + m0.p99LatencyMs + s0.p99LatencyMs : 0;

    const bestBalAccLatG = bestByBalancedAccuracyLatency(guardrailStats);
    const bestBalAccLatM = bestByBalancedAccuracyLatency(mealStats);
    const bestBalAccLatS = bestByBalancedAccuracyLatency(safetyStats);
    const bestBalAllG = bestByBalancedAllThree(guardrailStats);
    const bestBalAllM = bestByBalancedAllThree(mealStats);
    const bestBalAllS = bestByBalancedAllThree(safetyStats);
    const balAccLatG = first(bestBalAccLatG), balAccLatM = first(bestBalAccLatM), balAccLatS = first(bestBalAccLatS);
    const balAllG = first(bestBalAllG), balAllM = first(bestBalAllM), balAllS = first(bestBalAllS);
    const compAccLat = balAccLatG && balAccLatM && balAccLatS
      ? compositeForCombo(balAccLatG, balAccLatM, balAccLatS)
      : 0;
    const e2eP50AccLat = balAccLatG && balAccLatM && balAccLatS
      ? e2eP50ForCombo(balAccLatG, balAccLatM, balAccLatS)
      : 0;
    const pctFaster = e2eP50 > 0 ? Math.round(((e2eP50 - e2eP50AccLat) / e2eP50) * 100) : 0;

    const compositeLines = [
      chalk.dim('Recommended models (best per agent)\n'),
      chalk.cyan('guardrailCheck') + ` → ${bestGuardrails.map((m) => m.label).join(', ')} ` + scoreColor(guardrailMax)(`(${fmt(guardrailMax)}/100)`),
      chalk.cyan('mealAnalysis') + `   → ${bestMeals.map((m) => m.label).join(', ')} ` + scoreColor(mealMax)(`(${fmt(mealMax)}/100)`),
      chalk.cyan('safetyChecks') + `   → ${bestSafeties.map((m) => m.label).join(', ')} ` + scoreColor(safetyMax)(`(${fmt(safetyMax)}/100)`),
      '',
      chalk.bold('Composite eval score: ') + scoreColor(composite)(`${fmt(composite)}/100`),
      chalk.dim(`P50 end-to-end: ${fmt(e2eP50, 0)} ms`),
      chalk.dim(`P75 end-to-end: ${fmt(e2eP75, 0)} ms`),
      chalk.dim(`P95 end-to-end: ${fmt(e2eP95, 0)} ms`),
      chalk.dim(`P99 end-to-end: ${fmt(e2eP99, 0)} ms`),
      '',
      chalk.dim('Alternative (balanced): ') + `${balAccLatG?.label ?? '?'} + ${balAccLatM?.label ?? '?'} + ${balAccLatS?.label ?? '?'} → ${fmt(compAccLat)}/100 composite, ~${fmt(e2eP50AccLat, 0)} ms P50 (≈${pctFaster}% faster)`,
    ];

    const compositeWidth = Math.max(80, ...compositeLines.map((l) => stripAnsi(l).length)) + 4;
    console.log(
      boxen(compositeLines.join('\n'), {
        title: chalk.bold('3.1 Recommended Architecture'),
        titleAlignment: 'left',
        padding: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
        width: compositeWidth,
      }),
    );
    console.log();
  }

  if (guardrailStats.length > 0) {
    printTable('3.2 guardrailCheck', sortByScoreDesc(guardrailStats), 'Eval Score', new Set(bestG.models.map((m) => m.label)));
  }

  if (mealStats.length > 0) {
    const sortedMeal = sortByScoreDesc(mealStats);
    printTable('3.2 mealAnalysis (weighted composite)', sortedMeal, 'Composite Score', new Set(bestM.models.map((m) => m.label)));
    const firstModel = sortedMeal[0]!;
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
    printTable('3.2 safetyChecks', sortByScoreDesc(safetyStats), 'Eval Score', new Set(bestS.models.map((m) => m.label)));
  }

  if (guardrailStats.length > 0 && mealStats.length > 0 && safetyStats.length > 0) {
    const composite = WEIGHT_GUARDRAIL * guardrailMax + WEIGHT_MEAL * mealMax + WEIGHT_SAFETY * safetyMax;
    const g0 = first(bestGuardrails), m0 = first(bestMeals), s0 = first(bestSafeties);
    const e2eP50 = g0 && m0 && s0 ? e2eP50ForCombo(g0, m0, s0) : 0;

    const bestValG = bestByValue(guardrailStats);
    const bestValM = bestByValue(mealStats);
    const bestValS = bestByValue(safetyStats);
    const bestLatG = bestByLatency(guardrailStats);
    const bestLatM = bestByLatency(mealStats);
    const bestLatS = bestByLatency(safetyStats);
    const bestBalAccLatG = bestByBalancedAccuracyLatency(guardrailStats);
    const bestBalAccLatM = bestByBalancedAccuracyLatency(mealStats);
    const bestBalAccLatS = bestByBalancedAccuracyLatency(safetyStats);
    const bestBalAllG = bestByBalancedAllThree(guardrailStats);
    const bestBalAllM = bestByBalancedAllThree(mealStats);
    const bestBalAllS = bestByBalancedAllThree(safetyStats);

    const vg0 = first(bestValG.models)!, vm0 = first(bestValM.models)!, vs0 = first(bestValS.models)!;
    const lg0 = first(bestLatG.models)!, lm0 = first(bestLatM.models)!, ls0 = first(bestLatS.models)!;
    const balAccLatG = first(bestBalAccLatG)!, balAccLatM = first(bestBalAccLatM)!, balAccLatS = first(bestBalAccLatS)!;
    const balAllG = first(bestBalAllG)!, balAllM = first(bestBalAllM)!, balAllS = first(bestBalAllS)!;

    const compA = compositeForCombo(vg0, vm0, vs0);
    const compB = compositeForCombo(lg0, lm0, ls0);
    const compAccLat = compositeForCombo(balAccLatG, balAccLatM, balAccLatS);
    const compAll = compositeForCombo(balAllG, balAllM, balAllS);

    const dmCols = ['Scenario', 'guardrailCheck', 'mealAnalysis', 'safetyChecks', 'Composite', 'P50 (ms)'];
    const dmRows = [
      ['Best accuracy', bestGuardrails.map((m) => m.label).join(', '), bestMeals.map((m) => m.label).join(', '), bestSafeties.map((m) => m.label).join(', '), `${fmt(composite)}/100`, `${fmt(e2eP50, 0)}`],
      ['Best value (score per 1k tokens)', bestValG.models.map((m) => m.label).join(', '), bestValM.models.map((m) => m.label).join(', '), bestValS.models.map((m) => m.label).join(', '), `${fmt(compA)}/100`, `${fmt(e2eP50ForCombo(vg0, vm0, vs0), 0)}`],
      ['Best latency', bestLatG.models.map((m) => m.label).join(', '), bestLatM.models.map((m) => m.label).join(', '), bestLatS.models.map((m) => m.label).join(', '), `${fmt(compB)}/100`, `${fmt(e2eP50ForCombo(lg0, lm0, ls0), 0)}`],
      ['Balanced (accuracy + latency)', bestBalAccLatG.map((m) => m.label).join(', '), bestBalAccLatM.map((m) => m.label).join(', '), bestBalAccLatS.map((m) => m.label).join(', '), `${fmt(compAccLat)}/100`, `${fmt(e2eP50ForCombo(balAccLatG, balAccLatM, balAccLatS), 0)}`],
      ['Balanced (accuracy + latency + cost)', bestBalAllG.map((m) => m.label).join(', '), bestBalAllM.map((m) => m.label).join(', '), bestBalAllS.map((m) => m.label).join(', '), `${fmt(compAll)}/100`, `${fmt(e2eP50ForCombo(balAllG, balAllM, balAllS), 0)}`],
    ];
    printGridTable('3.3 Decision Matrix', dmCols, dmRows, { boldFromRow: 3 });
  }

  console.log();
}

main();
