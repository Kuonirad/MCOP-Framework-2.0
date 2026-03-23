## 2026-03-23 - Conflicting a11y attributes on decorative images
**Learning:** Decorative icons or images inside buttons or links that already contain descriptive text must have the `aria-hidden` attribute applied AND their `alt` attribute explicitly set to an empty string (`alt=""`). Leaving a descriptive `alt` text while using `aria-hidden` is an accessibility anti-pattern that creates conflicting instructions for screen readers.
**Action:** Always ensure both `aria-hidden` and `alt=""` are used together for decorative images inside links or buttons.
