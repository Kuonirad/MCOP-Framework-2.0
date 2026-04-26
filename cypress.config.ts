import { defineConfig } from "cypress";

/**
 * Cypress is wired against the **standalone production server**
 * (`node .next/standalone/server.js`) rather than the Turbopack
 * dev server. This is intentional and load-bearing:
 *
 *   - The documented hydration block (Next.js 16 + Turbopack
 *     `Error: Connection closed`) is a *dev-mode* runtime-chunk
 *     issue. The production build uses the standard Next.js
 *     pipeline and is unaffected, so Cypress can drive the real
 *     hydrated page end-to-end.
 *   - This also gives us production-realistic timings for the
 *     self-verifying LCP / INP / CLS spec, since the dev bundle
 *     would inflate every metric well past its budget.
 *
 * The companion CI workflow at `.github/workflows/cypress.yml`
 * builds, copies static assets into `.next/standalone/`, boots
 * the server on port 3000, and then runs `cypress run` against
 * the same `baseUrl` configured here. To reproduce locally:
 *
 *   pnpm build
 *   cp -r public .next/standalone/
 *   cp -r .next/static .next/standalone/.next/
 *   PORT=3000 node .next/standalone/server.js &
 *   pnpm cypress:run
 */
export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.{ts,tsx}",
    supportFile: "cypress/support/e2e.ts",
    fixturesFolder: "cypress/fixtures",
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10_000,
    pageLoadTimeout: 30_000,
    viewportWidth: 1280,
    viewportHeight: 800,
    retries: {
      runMode: 2,
      openMode: 0,
    },
  },
});
