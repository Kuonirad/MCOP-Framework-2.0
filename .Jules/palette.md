# Palette's Journal

This journal tracks critical UX and accessibility learnings, patterns, and insights. It is not a daily work log.

## 2024-05-22 - Keyboard Interaction Parity
**Learning:** Default templates often implement hover effects (like translating arrows) but neglect the corresponding focus states, leaving keyboard users with a "dead" interface compared to mouse users.
**Action:** Always pair `group-hover` animations with `group-focus-visible` equivalents for interactive elements to ensure a consistent level of delight and feedback for all users.
