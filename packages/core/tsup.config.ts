import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  target: 'node18',
  treeshake: true,
  // Ensure .cjs extension for CommonJS output so Node resolves it correctly
  // under the "type": "module" package. Matches the exports map.
  outExtension: ({ format }) => ({ js: format === 'cjs' ? '.cjs' : '.js' }),
});
