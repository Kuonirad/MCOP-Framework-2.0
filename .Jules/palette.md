## 2025-12-20 - Accessibility & Interaction Patterns
**Learning:** The application lacks visible H1 headings, using logos instead. To satisfy accessibility hierarchy without altering design, use `<h1 className="sr-only">TEXT</h1>` where TEXT matches the visual logo (e.g., "Next.js").
**Action:** Always check for missing H1s on landing pages and insert `sr-only` headings that mirror the visual hero element.

**Learning:** Arrow animations (`translate-x`) on links were mouse-only.
**Action:** Always pair `group-hover` animations with `group-focus-visible` to ensure keyboard users perceive the same affordance/delight.
