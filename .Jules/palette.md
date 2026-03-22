## 2026-03-22 - [Aria-Hidden vs Alt Attributes]
**Learning:** Applying `aria-hidden` to an image while leaving its descriptive `alt` text intact creates conflicting instructions for screen readers and is an accessibility anti-pattern. If an image is decorative, it needs BOTH `aria-hidden` and `alt=""`.
**Action:** When hiding decorative images from assistive technology, always pair `aria-hidden` with an explicitly empty `alt` text.
