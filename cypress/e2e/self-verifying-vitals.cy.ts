/// <reference types="cypress" />

/**
 * Self-verifying Core Web Vitals + VSI spec.
 *
 * The Performance HUD already publishes the page's live LCP / INP /
 * CLS / VSI numbers in `aria-label` attributes that follow a stable
 * grammar:
 *
 *     `${METRIC} ${formattedValue} ${status}`
 *
 * Where `status` is one of:
 *
 *     "good" | "needs-improvement" | "poor" | "pending"
 *
 * That gives the HUD a *machine-readable* shape we can use as the
 * test oracle. This spec turns the HUD into a self-verifying CI
 * check: it opens the panel, waits for each metric to leave the
 * `pending` state, parses the formatted value back into a number,
 * and asserts both the parsed value and the rendered status against
 * the published Core Web Vitals budgets.
 *
 * Why this works:
 *   - The classifier (`status`) is the single source of truth in
 *     the production code. Asserting it directly catches drift
 *     between the *displayed* status and the *underlying* value.
 *   - Re-parsing the formatted value back into a number and
 *     re-applying the budget catches the inverse drift: a status
 *     classifier that has gone out of sync with what the user
 *     actually sees.
 *   - VSI is included as a `bonus oracle` because the audit
 *     called it out by name; if VSI ever stops sampling it will
 *     fail the spec the same way LCP would.
 *
 * The standalone production server is intentionally tiny, so all
 * three vitals should comfortably land in the `good` band and CLS
 * should be effectively zero. If a future change pushes one of
 * them out of budget this spec is the early-warning system.
 */

const LCP_GOOD_BUDGET_MS = 2500;
const INP_GOOD_BUDGET_MS = 200;
const CLS_GOOD_BUDGET = 0.1;

type VitalsStatus = "good" | "needs-improvement" | "poor" | "pending";

interface ParsedAriaLabel {
  readonly metric: string;
  readonly rawValue: string;
  readonly status: VitalsStatus;
}

/**
 * Parse a HUD `aria-label` of the form `LCP 1.42 s good` (or
 * `CLS 0.001 good`, or `VSI 0.94 good`). The grammar is fixed by
 * `MetricRow` / `VSICoach`; if it ever changes we *want* this
 * spec to fail loudly.
 */
function parseAriaLabel(label: string): ParsedAriaLabel {
  const cleaned = label.trim().replace(/\s+/g, " ");
  const tokens = cleaned.split(" ");
  const metric = tokens[0];
  const status = tokens.at(-1) as VitalsStatus;
  const rawValue = tokens.slice(1, -1).join(" ");
  return { metric, rawValue, status };
}

/**
 * Convert the human-formatted value (e.g. `1.42 s`, `420 ms`,
 * `0.001`) back into a comparable scalar in the metric's native
 * unit (ms for LCP/INP, unitless for CLS/VSI).
 */
function valueToScalar(metric: string, raw: string): number {
  if (raw === "—") return Number.NaN;
  const numeric = Number.parseFloat(raw);
  if (Number.isNaN(numeric)) return Number.NaN;
  if (metric === "LCP" || metric === "INP") {
    if (/\bs\b/.test(raw)) return numeric * 1000;
    return numeric; // already ms
  }
  return numeric; // CLS / VSI are unitless
}

function waitForMetricSample(
  metric: "LCP" | "INP" | "CLS",
  timeoutMs = 15_000,
): Cypress.Chainable<ParsedAriaLabel> {
  return cy
    .get(`[data-testid="performance-hud-panel"] [aria-label^="${metric} "]`, {
      timeout: timeoutMs,
    })
    .should((el) => {
      const label = el.attr("aria-label") ?? "";
      const parsed = parseAriaLabel(label);
      // Wait until the metric has actually sampled — i.e. left
      // the `pending` placeholder. A pending metric means the
      // PerformanceObserver hasn't fired yet.
      expect(parsed.status, `${metric} status`).not.to.equal("pending");
    })
    .then((el) => parseAriaLabel(el.attr("aria-label") ?? ""));
}

describe("Self-verifying live vitals (HUD as oracle)", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.get('button[aria-controls="performance-hud-panel"]').click();
    cy.get('[data-testid="performance-hud-panel"]').should(
      "have.attr",
      "data-open",
      "true",
    );
  });

  it("LCP samples and lands within the `good` budget on the production server", () => {
    waitForMetricSample("LCP").then(({ metric, rawValue, status }) => {
      expect(metric).to.equal("LCP");
      const ms = valueToScalar("LCP", rawValue);
      expect(ms, `parsed LCP value (ms)`).to.be.greaterThan(0);
      expect(ms, `LCP under good budget`).to.be.lessThan(LCP_GOOD_BUDGET_MS);
      expect(status, `LCP status`).to.equal("good");
    });
  });

  it("CLS samples and is effectively zero on the static landing page", () => {
    // CLS only fires on layout shift; the production landing page
    // is engineered for a *zero* CLS so we provoke a sample by
    // toggling the panel (which is GPU-only and must not shift).
    cy.get("body").type("{esc}");
    cy.get("body").type("{alt}p");
    waitForMetricSample("CLS").then(({ metric, rawValue, status }) => {
      expect(metric).to.equal("CLS");
      const cls = valueToScalar("CLS", rawValue);
      expect(cls, "CLS value").to.be.lessThan(CLS_GOOD_BUDGET);
      expect(status, "CLS status").to.equal("good");
    });
  });

  it("INP samples after a real interaction and lands within budget", () => {
    // INP requires a real input. Click the panel toggle a couple
    // of times to generate interactions; the HUD should publish a
    // non-pending sample shortly after.
    const toggle = cy.get('button[aria-controls="performance-hud-panel"]');
    toggle.click();
    toggle.click();

    waitForMetricSample("INP").then(({ metric, rawValue, status }) => {
      expect(metric).to.equal("INP");
      const ms = valueToScalar("INP", rawValue);
      expect(ms, "parsed INP value (ms)").to.be.greaterThan(0);
      expect(ms, "INP under good budget").to.be.lessThan(INP_GOOD_BUDGET_MS);
      expect(status, "INP status").to.equal("good");
    });
  });

  it("VSI Coach publishes a sample alongside the core vitals", () => {
    cy.get('[data-testid="vsi-coach"]').should("exist");
    cy.get('[data-testid="vsi-coach"] [aria-label^="VSI "]').should((el) => {
      const parsed = parseAriaLabel(el.attr("aria-label") ?? "");
      expect(parsed.metric).to.equal("VSI");
      // A non-pending VSI sample is the contract the audit cares
      // about; the *exact* status drifts across runs as the page
      // settles, so we tolerate any non-pending classification.
      expect(parsed.status).not.to.equal("pending");
    });
  });

  it("badge agrees with the runtime: `live` mode in real Chrome", () => {
    // Re-asserts the cross-check from `performance-hud.cy.ts` so
    // that *this* spec is self-contained — if you only run the
    // self-verifying suite you still know whether the metrics
    // came from a real browser or a polyfilled environment.
    cy.get('[data-testid="performance-hud-test-mode"]')
      .should("have.attr", "data-mode", "live")
      .and("contain.text", "Live");
  });
});
