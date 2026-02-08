## 2025-02-18 - Keyboard Accessibility for Directional Cues
**Learning:** Directional cues like translating arrows (`->`) that rely solely on `hover` states leave keyboard users behind. The `group-focus-visible` utility is critical for mirroring these interactions when elements receive keyboard focus, ensuring a consistent and delightful experience for all users.
**Action:** Whenever implementing `group-hover:translate-*` or similar interactive animations, always pair it with `group-focus-visible:translate-*` to maintain accessibility parity.
