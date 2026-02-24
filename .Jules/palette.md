# Palette's Journal

## 2025-12-20 - Directional Link Arrow Pattern
**Learning:** Keyboard users often miss out on the subtle "slide right" animation that hover users see on arrow links (e.g., "Read more ->"), creating an inconsistent experience.
**Action:** Always use `group` on the parent anchor and apply `group-focus-visible:translate-x-1` to the arrow span (in addition to `group-hover:translate-x-1`) to ensure consistent visual feedback for keyboard navigation.

```tsx
// Pattern
<a className="group ...">
  Link Text
  <span className="group-hover:translate-x-1 group-focus-visible:translate-x-1 transition-transform inline-block">
    →
  </span>
</a>
```
