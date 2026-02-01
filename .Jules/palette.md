## 2026-02-01 - Missing H1 in Starter Templates
**Learning:** Default framework starter templates (like Next.js) often focus on visual branding (SVG logos) but omit semantic hierarchy roots (`<h1>`), failing WCAG 2.1 Criteria 1.3.1 (Info and Relationships) out of the box.
**Action:** Always verify the document outline (`<h1>`-`<h6>`) explicitly, even in "production-ready" starter kits, and add `sr-only` headings where visual design relies on non-text elements (like logos) as the primary page title.
