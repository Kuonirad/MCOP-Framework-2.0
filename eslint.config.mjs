import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".venv/**",
      ".next/**",
      "out/**",
      "build/**",
      "apps/desktop/src-tauri/resources/**",
      "apps/desktop/src-tauri/target/**",
      "apps/desktop/src-tauri/gen/**",
      // tsup build artefacts under workspace packages (e.g.
      // `packages/core/dist/index.cjs`) are generated CommonJS files
      // that intentionally use `require()` and would otherwise trip
      // `@typescript-eslint/no-require-imports`.  Source-of-truth
      // remains under `packages/*/src/`.
      "**/dist/**",
      "coverage/**",
      "cypress/**",
      // Static assets shipped to the browser as-is. Includes the
      // /showcase/* design-handoff bundle whose .jsx files rely on
      // browser globals (React, ReactDOM, Babel) loaded via <script>
      // rather than ES imports — not lintable as a Next.js source tree.
      "public/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
