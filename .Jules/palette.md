# Polymathic Palette's Journal

## 2025-02-14 - [Hover Effects Exclude Keyboard Users]
**Learning:** Micro-interactions like translating an arrow on hover (`group-hover:translate-x-1`) completely exclude keyboard users if a corresponding focus state isn't provided. This creates an inequitable experience where only mouse users receive the visual cue that a link is interactive or directional.
**Action:** Always pair `hover:` micro-interaction classes with their `focus-visible:` equivalents (e.g., `group-focus-visible:translate-x-1`) to ensure keyboard navigators receive the same visual feedback.
