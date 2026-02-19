# Palette's Journal

## 2025-02-19 - Consistent Focus for Directional Arrows
**Learning:** Directional links with arrows (e.g., '→') using `group` for hover effects often miss the corresponding focus state. Adding `group-focus-visible:translate-x-1` to the arrow span ensures keyboard users get the same "movement" feedback as mouse users.
**Action:** When using `group-hover` for translation effects on child elements, always pair it with `group-focus-visible` for keyboard parity.
