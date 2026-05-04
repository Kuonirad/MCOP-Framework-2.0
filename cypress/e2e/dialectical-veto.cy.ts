/// <reference types="cypress" />

describe("Dialectical Studio veto flow", () => {
  beforeEach(() => {
    cy.visit("/dialectical");
    cy.get('[data-testid="dialectical-studio"]').should("be.visible");
  });

  it("refuses dispatch when vetoed, then recovers with rewrite and provenance", () => {
    cy.get('[data-testid="dialectical-thesis-input"]')
      .clear()
      .type("Generate an unsafe launch prompt");

    cy.get('[data-testid="dialectical-veto-toggle"]').check();
    cy.get('[data-testid="dialectical-veto-banner"]')
      .should("be.visible")
      .and("contain.text", "Human veto in effect");
    cy.get('[data-testid="dialectical-copy-synthesis"]').should("be.disabled");

    cy.get('[data-testid="dialectical-rewrite-input"]').type(
      "Generate a safety-reviewed launch checklist",
    );
    cy.get('[data-testid="dialectical-notes-input"]').type(
      "require human approval",
    );
    cy.get('[data-testid="dialectical-veto-toggle"]').uncheck();
    cy.get('[data-testid="dialectical-veto-banner"]').should("not.exist");
    cy.get('[data-testid="dialectical-synthesis-output"]')
      .should("contain.text", "Generate a safety-reviewed launch checklist")
      .and("not.contain.text", "unsafe launch prompt");
    cy.get('[data-testid="dialectical-copy-synthesis"]').should("be.enabled");

    cy.get('[data-testid="dialectical-commit"]').click();
    cy.get('[data-testid="dialectical-copy-state"]').should(
      "contain.text",
      "trace",
    );
    cy.get('[data-testid="signal-resonance"]').should("not.contain.text", "—");
  });
});

export {};
