## 2025-02-23 - Focus States for Directional Cues
**Learning:** Directional cues (like arrows) that animate on hover often lack equivalent focus states, leaving keyboard users without the same visual feedback.
**Action:** When adding `group-hover:translate-x-*`, always add `group-focus-visible:translate-x-*` to ensure consistent feedback for all input methods.
