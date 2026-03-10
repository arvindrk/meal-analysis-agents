import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EVALS_DATASETS_DIR = join(ROOT, "evals", "datasets");
export const EVALS_RESULTS_DIR = join(ROOT, "evals", "output", "results");
export const EVALS_REPORTS_DIR = join(ROOT, "evals", "output", "reports");
