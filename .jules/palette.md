## 2024-02-14 - Accessible Link Patterns
**Learning:** Default external links lack screen reader context and tactile feedback, making the UI feel "flat" and less accessible.
**Action:** Always include `active:scale-95` for button-like links, `focus-visible` rings using theme colors, and `sr-only` spans for external link context.

## 2024-02-14 - Directional Micro-interactions
**Learning:** Static arrow icons in links (→) miss an opportunity to reinforce directionality. Animating the arrow on hover (translating x) creates a subtle, delightful affordance that encourages action.
**Action:** Wrap directional characters/icons in a span with `group-hover:translate-x-1` (and `motion-reduce:transform-none`) when the parent link is hovered.
## 2024-03-20 - Animated Arrow Links
**Learning:** Simple text arrows in links feel static. Separating the arrow allows for playful interaction without breaking text decoration.
**Action:** For links with arrows (→), wrap text in `group-hover:underline` and arrow in `group-hover:translate-x-1`. Use `motion-reduce` to disable animation.

## 2025-02-20 - Fluid Button Sizing
**Learning:** Fixed width buttons (e.g., `md:w-[158px]`) break layout when content changes (translations, dynamic text) or user settings (font scaling) vary.
**Action:** Avoid fixed width constraints on buttons. Use `w-auto` and padding to let content dictate size, ensuring flexibility and accessibility.
## 2025-12-22 - Fluid Button Containers
**Learning:** Fixed width constraints on buttons break layout when adding micro-UX elements like icons and animated arrows.
**Action:** When enhancing button content, remove fixed width constraints (e.g., `w-[158px]`) and rely on flexbox/padding to allow the container to adapt naturally.
## 2025-03-27 - Resolving Conflicting Screen Reader Instructions for Decorative Icons
**Learning:** Adding `aria-hidden` to decorative icons (like `next/image` in Next.js) while simultaneously retaining descriptive `alt` text creates conflicting instructions for screen readers, which can result in redundant or confused announcements. The `aria-hidden` attribute tells screen readers to ignore the element, while the `alt` text provides a description to be read.
**Action:** When using `aria-hidden` on decorative images inside interactive elements that already contain sufficient text content, always explicitly set the `alt` attribute to an empty string (`alt=""`). This ensures screen readers correctly bypass the image without any conflicting commands.
