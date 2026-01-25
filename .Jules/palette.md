## 2025-02-18 - Keyboard Interaction Consistency
**Learning:** Interactive elements with hover animations (like translating arrows or underlines) must include corresponding `group-focus-visible` classes (e.g., `group-focus-visible:translate-x-1`) to ensure keyboard users receive equivalent feedback.
**Action:** Always mirror `hover` and `group-hover` transition states with `focus-visible` and `group-focus-visible` counterparts.
