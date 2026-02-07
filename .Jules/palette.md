## 2025-05-18 - Keyboard Focus Delight
**Learning:** Users notice when keyboard interactions lack the same polish as mouse interactions. The arrow animation on hover was a nice touch, but keyboard users missed out on it, making the interface feel less responsive for them.
**Action:** Added `group-focus-visible:translate-x-1` to the arrow spans to ensure they animate when the parent link is focused via keyboard, matching the hover behavior.
