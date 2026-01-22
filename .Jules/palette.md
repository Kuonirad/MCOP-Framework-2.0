# Palette's Journal

## 2025-05-18 - Keyboard Animation Consistency
**Learning:** Interactive elements with hover animations (like translating arrows or underlines) must include corresponding `group-focus-visible` classes (e.g., `group-focus-visible:translate-x-1`) to ensure keyboard users receive equivalent feedback.
**Action:** When adding `group-hover` animations, always pair them with `group-focus-visible` variants.
