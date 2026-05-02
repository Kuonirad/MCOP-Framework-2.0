/**
 * VSI compute-path parity guardian.
 *
 * Until 2026-05-01 the VSI aggregation algorithm lived in three places:
 *   - `usePerformanceCoach.computeVSI`
 *   - `useVSIWorker.fallbackCompute`
 *   - the inline string body of the Web Worker in `useVSIWorker.WORKER_SCRIPT`
 *
 * They are now all unified behind the canonical `computeVSI` in
 * `src/components/computeVSI.ts`. This test pins that contract:
 *
 *   1. `fallbackCompute` and the canonical `computeVSI` produce
 *      byte-identical results across a deterministic fixture matrix.
 *   2. The worker-script body (a string literal at module-load time)
 *      contains the exact source of `computeVSI.toString()` — proving
 *      that any future change to the canonical implementation
 *      automatically propagates to the worker without a hand-edit.
 *   3. Eval'ing the worker-script body and invoking the embedded
 *      `computeVSI` against the same fixtures yields the same results
 *      as direct invocation. This is the strongest available
 *      cross-context check in jsdom (no real Worker available).
 */

import { computeVSI } from "@/components/computeVSI";
import { fallbackCompute } from "@/components/useVSIWorker";

interface Fixture {
  readonly name: string;
  readonly samples: ReadonlyArray<{
    value: number;
    startTime: number;
    source: { tagName: string | null; selector: string | null; heightPx: number } | null;
  }>;
  readonly now: number;
}

const OPTS = {
  windowMs: 10_000,
  recentMs: 2_000,
  pollMs: 250,
  sparklineCap: 32,
} as const;

const SHARED_OPTS = {
  windowMs: OPTS.windowMs,
  recentMs: OPTS.recentMs,
  sparklineCap: OPTS.sparklineCap,
  goodThreshold: 0.1,
  poorThreshold: 0.25,
};

const FIXTURES: ReadonlyArray<Fixture> = [
  { name: "empty buffer", samples: [], now: 1_000 },
  {
    name: "single in-window shift",
    samples: [{ value: 0.05, startTime: 500, source: null }],
    now: 1_000,
  },
  {
    name: "single in-window attributed shift",
    samples: [
      {
        value: 0.05,
        startTime: 500,
        source: { tagName: "img", selector: "#hero", heightPx: 400 },
      },
    ],
    now: 1_000,
  },
  {
    name: "all aged-out (window cutoff)",
    samples: [
      { value: 0.5, startTime: 0, source: null },
      { value: 0.5, startTime: 100, source: null },
    ],
    now: 50_000,
  },
  {
    name: "degrading: recent storm with quiet older slice",
    samples: [
      { value: 0.02, startTime: 1_000, source: null },
      { value: 0.08, startTime: 9_000, source: null },
      { value: 0.06, startTime: 9_500, source: null },
    ],
    now: 10_000,
  },
  {
    name: "improving: older heavy, recent quiet",
    samples: [
      { value: 0.18, startTime: 1_000, source: null },
      { value: 0.005, startTime: 9_500, source: null },
    ],
    now: 10_000,
  },
  {
    name: "exactly at good threshold",
    samples: [{ value: 0.1, startTime: 5_000, source: null }],
    now: 10_000,
  },
  {
    name: "exactly at poor threshold",
    samples: [{ value: 0.25, startTime: 5_000, source: null }],
    now: 10_000,
  },
  {
    name: "exceeds poor threshold",
    samples: [
      { value: 0.2, startTime: 5_000, source: null },
      { value: 0.1, startTime: 5_500, source: null },
    ],
    now: 10_000,
  },
  {
    name: "sparkline cap respected",
    samples: Array.from({ length: 50 }, (_, i) => ({
      value: 0.001,
      startTime: 1_000 + i * 100,
      source: null,
    })),
    now: 10_000,
  },
  {
    name: "all in older slice (no recent activity)",
    samples: [
      { value: 0.05, startTime: 1_000, source: null },
      { value: 0.05, startTime: 5_000, source: null },
    ],
    now: 10_000,
  },
];

describe("VSI compute parity", () => {
  describe("computeVSI ≡ fallbackCompute", () => {
    for (const fixture of FIXTURES) {
      it(`agrees on "${fixture.name}"`, () => {
        const direct = computeVSI(fixture.samples, fixture.now, SHARED_OPTS);
        const viaFallback = fallbackCompute({
          type: "compute",
          samples: fixture.samples,
          now: fixture.now,
          opts: OPTS,
        });
        expect(viaFallback).toEqual(direct);
      });
    }
  });

  describe("worker-script source parity", () => {
    // When Jest runs with --coverage, Istanbul injects `cov_*` variables
    // into the source. This makes both `computeVSI.toString()` checks and
    // `eval()` of the worker script invalid. Skip these tests under
    // instrumentation — the computeVSI ≡ fallbackCompute tests above still
    // verify correctness; these tests verify source parity which is
    // impossible when the source has been rewritten.
    const isInstrumented =
      typeof (globalThis as Record<string, unknown>).__coverage__ !==
        "undefined" || computeVSI.toString().includes("cov_");

    it("worker script embeds the canonical computeVSI source", () => {
      if (isInstrumented) {
        // eslint-disable-next-line no-console
        console.warn(
          "[vsi.parity] Skipping source-parity check — Istanbul coverage " +
            "instrumentation detected. This is expected in CI."
        );
        return;
      }
      // Reach into the module to grab WORKER_SCRIPT — we expose it via a
      // dedicated test-only re-export so this assertion never depends on
      // mutable module internals.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@/components/useVSIWorker") as {
        readonly __WORKER_SCRIPT_FOR_TESTS: string;
      };
      const script = mod.__WORKER_SCRIPT_FOR_TESTS;
      expect(script).toContain(computeVSI.toString());
    });

    it("eval'd worker-script computeVSI matches direct invocation", () => {
      if (isInstrumented) {
        // eslint-disable-next-line no-console
        console.warn(
          "[vsi.parity] Skipping eval-parity check — Istanbul coverage " +
            "instrumentation detected. This is expected in CI."
        );
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("@/components/useVSIWorker") as {
        readonly __WORKER_SCRIPT_FOR_TESTS: string;
      };
      const script = mod.__WORKER_SCRIPT_FOR_TESTS;

      // Extract the `computeVSI` function expression literally from the
      // worker-script source so this test cannot be satisfied by a
      // direct reference to the imported `computeVSI`. The script's
      // first non-blank statement is `const computeVSI = <expr>;` —
      // pull `<expr>` out and eval it in isolation.
      const match = script.match(/const computeVSI = ([\s\S]+?);\n\nself\.onmessage/);
      expect(match).not.toBeNull();
      const fnSource = match![1];

      const evaluated = new Function(`return (${fnSource});`)() as typeof computeVSI;
      expect(typeof evaluated).toBe("function");

      for (const fixture of FIXTURES) {
        const direct = computeVSI(fixture.samples, fixture.now, SHARED_OPTS);
        const evaled = evaluated(fixture.samples, fixture.now, SHARED_OPTS);
        expect(evaled).toEqual(direct);
      }
    });
  });
});
