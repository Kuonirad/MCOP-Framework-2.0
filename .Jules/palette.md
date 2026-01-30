## 2025-05-24 - [Missing Heading & Inconsistent Focus States]
**Learning:** The landing page relied on a logo image as the primary heading, leaving screen reader users without a structural entry point (H1). Additionally, while hover states included motion (translating arrows), keyboard focus states were static, creating a degraded experience for keyboard users.
**Action:** Always include a visually hidden H1 when the visual design uses a logo as the title. Ensure all `hover` transformations have a corresponding `focus-visible` state using the `group` modifier to maintain interaction parity.
