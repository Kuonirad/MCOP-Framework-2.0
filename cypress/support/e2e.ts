/**
 * Cypress support file — runs once per spec before any test code.
 *
 * Kept intentionally small. The repo's accepted testing path
 * (jsdom + SSR HTML) is the canonical proof-of-correctness for
 * client components; Cypress is a *complementary* live-browser
 * layer, not a replacement. We therefore avoid installing custom
 * commands that diverge from the jest spec ergonomics.
 */
export {};

// Fail the test if the page logs an *unexpected* uncaught exception.
// Returning `false` from `uncaught:exception` swallows the failure;
// returning anything else lets Cypress fail the test.
Cypress.on("uncaught:exception", (err) => {
  // Hydration-time aborts on the first navigation are tolerated
  // because some Next.js telemetry can race the unmount; nothing
  // user-facing depends on these.
  if (/AbortError|cancelled/i.test(err.message)) return false;
  return undefined;
});
