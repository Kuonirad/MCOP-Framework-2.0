## 2026-02-05 - Tailwind v4 Transform Utilities on Hover
**Learning:** `transform` utilities (like `scale`, `translate`) on `hover` states may fail to apply correctly in the current Next.js/Turbopack/Tailwind v4 environment, while `box-shadow` works reliably.
**Action:** Use `hover:shadow-lg` for lift effects instead of `hover:-translate-y-1` until the issue is resolved.
