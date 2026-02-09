# PALETTE'S JOURNAL - CRITICAL LEARNINGS ONLY

## 2025-10-25 - Focus Visible Arrow
**Learning:** Transform utilities like `translate-x` on `hover` are often missed by keyboard users who navigate via Tab. Adding `group-focus-visible` ensures consistent feedback.
**Action:** When using `group-hover:translate-x-*` on an icon inside a link, always add `group-focus-visible:translate-x-*` to mirror the interaction for keyboard users.
