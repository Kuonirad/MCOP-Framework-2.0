## 2025-12-19 - Interaction Consistency

**Learning:** `group-hover` transitions on parent elements often miss keyboard users. When using `group-hover` to animate child elements (like arrows in links), always pair it with `group-focus-visible` to ensure keyboard users receive the same visual feedback as mouse users.

**Action:** Audit all `group-hover` instances and ensure a corresponding `group-focus-visible` utility is present for interactive elements.
