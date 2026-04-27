import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
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
      ".next/**",
      "out/**",
      "build/**",
      // tsup build artefacts under workspace packages (e.g.
      // `packages/core/dist/index.cjs`) are generated CommonJS files
      // that intentionally use `require()` and would otherwise trip
      // `@typescript-eslint/no-require-imports`.  Source-of-truth
      // remains under `packages/*/src/`.
      "**/dist/**",
      "coverage/**",
      "cypress/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
