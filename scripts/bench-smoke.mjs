#!/usr/bin/env node
/**
 * bench:smoke — non-marketing smoke benchmark.
 *
 * This intentionally does NOT print "X ops/sec" headlines that the claim
 * audit will treat as drift. It just proves that:
 *
 *   1. The benchmark harness can boot.
 *   2. The deterministic primitives complete N iterations without error
 *      under a hard time budget (default: 5 seconds).
 *   3. A machine-readable result is written to audit-artifacts/bench-smoke.json
 *      so reviewers can compare runs over time.
 *
 * Exit codes: 0 = within budget, 1 = exceeded budget or threw.
 */

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = join(repoRoot, "audit-artifacts");
mkdirSync(outDir, { recursive: true });

let canonicalize;
try {
  ({ default: canonicalize } = await import("canonicalize"));
} catch (err) {
  console.error("ERROR: cannot resolve 'canonicalize' module — run pnpm install first.");
  console.error(err.message);
  process.exit(1);
}

const ITER = Number(process.env.BENCH_SMOKE_ITER ?? 2000);
const BUDGET_MS = Number(process.env.BENCH_SMOKE_BUDGET_MS ?? 5000);

const sample = {
  agent: "mcop",
  step: 0,
  payload: Array.from({ length: 32 }, (_, i) => ({ i, t: Math.sin(i) })),
};

const start = performance.now();
let lastHash = "";
for (let i = 0; i < ITER; i++) {
  sample.step = i;
  const canonical = canonicalize(sample);
  lastHash = createHash("sha256").update(canonical, "utf8").digest("hex");
}
const elapsed = performance.now() - start;

const result = {
  iterations: ITER,
  elapsed_ms: Number(elapsed.toFixed(3)),
  budget_ms: BUDGET_MS,
  within_budget: elapsed <= BUDGET_MS,
  last_hash: lastHash,
  node: process.version,
  timestamp: new Date().toISOString(),
};

writeFileSync(join(outDir, "bench-smoke.json"), JSON.stringify(result, null, 2));

console.log(`bench:smoke iterations=${ITER} elapsed=${result.elapsed_ms}ms budget=${BUDGET_MS}ms within=${result.within_budget}`);

process.exit(result.within_budget ? 0 : 1);
