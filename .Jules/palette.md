## 2026-02-25 - Directional Link Accessibility
**Learning:** Directional links with arrows (e.g., '→') often only animate on hover. For consistent accessibility, they must also animate on focus.
**Action:** Use the `group` class on the parent anchor and a wrapper span for the arrow with `group-focus-visible:translate-x-1` alongside `group-hover:translate-x-1`.
