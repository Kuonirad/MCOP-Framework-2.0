## 2025-10-26 - Keyboard Animation Consistency
**Learning:** Interactive elements with hover animations (like translating arrows or underlines) must include corresponding `group-focus-visible` classes to ensure keyboard users receive equivalent feedback.
**Action:** Always pair `group-hover:translate-x-1` with `group-focus-visible:translate-x-1` and `group-hover:underline` with `group-focus-visible:underline`.
