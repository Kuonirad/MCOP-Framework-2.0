/// <reference types="cypress" />

/**
 * Performance HUD — end-to-end spec.
 *
 * Drives the *real* hydrated landing page from the standalone
 * production server (see `cypress.config.ts` for why we point
 * at the production build, not the Turbopack dev server). The
 * spec focuses on the contract surfaces the audit cares about:
 *
 *   1. The HUD's toggle button is present, `aria-controls` is wired,
 *      and the keyboard shortcut hint matches the implementation.
 *   2. Opening the panel reveals the `Live vitals` heading and the
 *      three Core Web Vitals rows (LCP / INP / CLS).
 *   3. The new `Test Mode` badge auto-detects `live` against a real
 *      browser (because Chrome populates
 *      `PerformanceObserver.supportedEntryTypes`), with the matching
 *      `data-mode="live"` attribute and the emerald colour palette.
 *   4. `Escape` closes the panel; `Alt+P` re-opens it.
 *
 * These are deliberately *contract* assertions rather than visual
 * snapshots so the spec stays meaningful when the cosmetic layer
 * changes but the audit invariants do not.
 */

describe("Performance HUD — production hydration", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("renders the floating toggle button with correct ARIA wiring", () => {
    cy.get('[data-testid="performance-hud"]').should("exist");
    cy.findToggleButton()
      .should("have.attr", "aria-controls", "performance-hud-panel")
      .and("have.attr", "aria-keyshortcuts", "Alt+P")
      .and("have.attr", "aria-expanded", "false");
  });

  it("opens the panel on click and reveals the three Core Web Vitals rows", () => {
    cy.findToggleButton().click();
    cy.findPanel()
      .should("have.attr", "data-open", "true")
      .and("not.have.attr", "inert");
    // Heading.
    cy.findPanel().contains("Live vitals").should("be.visible");
    // Three rows. We assert by aria-label prefix because the value
    // updates as samples arrive; the *presence* of the row is the
    // contract, not its current numeric value.
    cy.findPanel().find('[aria-label^="LCP "]').should("exist");
    cy.findPanel().find('[aria-label^="INP "]').should("exist");
    cy.findPanel().find('[aria-label^="CLS "]').should("exist");
  });

  it("auto-detects Live mode in the Test Mode badge against real Chrome", () => {
    cy.findToggleButton().click();
    cy.get('[data-testid="performance-hud-test-mode"]')
      // Real Chrome reports a non-empty
      // `PerformanceObserver.supportedEntryTypes`, so the auto-
      // detector must resolve to `live` (not the SSR/jsdom default).
      .should("have.attr", "data-mode", "live")
      .and("contain.text", "Live")
      .and(
        "have.attr",
        "aria-label",
        "Test mode: Live — metrics from real PerformanceObserver",
      )
      // Emerald colour palette confirms the visual signal matches
      // the data-mode value (a regression in the JSX class branch
      // would silently desync the two without this check).
      .and("have.class", "text-emerald-200")
      .and("have.class", "border-emerald-400/40");
  });

  it("closes the panel on Escape and re-opens it via Alt+P", () => {
    cy.findToggleButton().click();
    cy.findPanel().should("have.attr", "data-open", "true");

    cy.get("body").type("{esc}");
    cy.findPanel().should("have.attr", "data-open", "false");

    // Alt+P toggles from anywhere on the page, not just the button.
    cy.get("body").type("{alt}p");
    cy.findPanel().should("have.attr", "data-open", "true");
  });
});

// ----- typed helpers --------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      findToggleButton(): Chainable<JQuery<HTMLElement>>;
      findPanel(): Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add("findToggleButton", () =>
  cy.get('button[aria-controls="performance-hud-panel"]'),
);

Cypress.Commands.add("findPanel", () =>
  cy.get('[data-testid="performance-hud-panel"]'),
);

export {};
