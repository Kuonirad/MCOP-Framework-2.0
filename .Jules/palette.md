# Palette's Journal

## 2025-05-18 - [Sample Entry]
**Learning:** This is a sample entry to initialize the file.
**Action:** Replace with real learnings.

## 2025-12-19 - [Directional Link Consistency]
**Learning:** Directional links with arrows (e.g., "Read docs ->") often use `group-hover:translate-x-1` for a delightful hover effect. However, this leaves keyboard users without the same visual feedback.
**Action:** Always add `group-focus-visible:translate-x-1` to the arrow wrapper when using `group-hover:translate-x-1`. Ensure the parent anchor has the `group` class.
