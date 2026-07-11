#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundleRoot = path.resolve(
  repoRoot,
  process.argv[2] ?? 'apps/desktop/src-tauri/target/release/bundle',
);
const extensions = new Set(['.msi', '.exe', '.appimage', '.deb']);

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  });
}

const artifacts = filesUnder(bundleRoot)
  .filter((file) => extensions.has(path.extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b));

if (artifacts.length === 0) throw new Error(`No desktop installers found under ${bundleRoot}`);

const lines = artifacts.map((file) => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  return `${digest}  ${path.relative(bundleRoot, file).replaceAll('\\', '/')}`;
});
const output = path.join(bundleRoot, `SHA256SUMS-${process.platform}.txt`);
fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${artifacts.length} installer checksum(s) to ${output}`);
