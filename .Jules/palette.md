## 2025-05-18 - Keyboard Focus for Directional Arrows
**Learning:** Directional links with arrows (e.g., '→') use `group-hover:translate-x-1` for mouse users but lack equivalent feedback for keyboard users.
**Action:** Always add `group-focus-visible:translate-x-1` to the arrow span (alongside `group-hover` and `motion-reduce:transform-none`) to ensure keyboard users receive the same directional cue. Ensure the parent anchor has the `group` class.
