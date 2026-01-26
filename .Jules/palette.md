## 2026-01-26 - [Interactive Link Consistency]
**Learning:** Animated directional links using `group-hover:translate-x-1` are a common pattern but often lack keyboard accessibility.
**Action:** Always pair `group-hover` animations on interactive elements with `group-focus-visible` variants (e.g., `group-focus-visible:translate-x-1`) to ensure keyboard users receive equivalent feedback.
