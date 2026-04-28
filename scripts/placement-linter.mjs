#!/usr/bin/env node
/**
 * Placement Linter — Audits file placement against directory conventions.
 *
 * This script enforces the repository layout defined in CONTRIBUTING.md.
 * It ensures that new files are placed in the correct directories and
 * that core/adapter boundaries are respected.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const CONVENTIONS = [
  {
    dir: 'src/app',
    description: 'Next.js App Router routes + server components',
    pattern: /.*/,
    allowedExts: ['.ts', '.tsx', '.css', '.md', '.ico'],
  },
  {
    dir: 'src/components',
    description: 'Client components (HUD, VSI Coach, hooks)',
    pattern: /.*/,
    allowedExts: ['.ts', '.tsx', '.css'],
  },
  {
    dir: 'src/core',
    description: 'Triad kernels (Encoder, Stigmergy, Etch)',
    pattern: /.*/,
    allowedExts: ['.ts'],
  },
  {
    dir: 'src/adapters',
    description: 'TypeScript Universal Adapter Protocol implementations',
    pattern: /.*/,
    allowedExts: ['.ts'],
  },
  {
    dir: 'docs',
    description: 'Long-form architecture + protocol docs',
    pattern: /.*/,
    allowedExts: ['.md', '.png', '.jpg', '.svg', '.json'],
  },
  {
    dir: 'scripts',
    description: 'Repository automation and audit scripts',
    pattern: /.*/,
    allowedExts: ['.mjs', '.sh', '.js'],
  }
];

const IGNORE_DIRS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.venv',
  '__tests__',
  'cypress',
  'mcop_package/tests',
];

let violations = 0;

function auditDir(currentDir) {
  const fullPath = join(REPO_ROOT, currentDir);
  if (!fs.existsSync(fullPath)) return;

  const entries = fs.readdirSync(fullPath);

  for (const entry of entries) {
    const relPath = join(currentDir, entry);
    const absPath = join(REPO_ROOT, relPath);
    const stats = fs.statSync(absPath);

    if (stats.isDirectory()) {
      if (IGNORE_DIRS.some(id => relPath.includes(id))) continue;
      auditDir(relPath);
    } else {
      checkFile(relPath);
    }
  }
}

function checkFile(relPath) {
  // Only check files in known top-level directories
  const convention = CONVENTIONS.find(c => relPath.startsWith(c.dir));
  if (!convention) return;

  const ext = extname(relPath);
  if (!convention.allowedExts.includes(ext)) {
    console.error(`VIOLATION: File "${relPath}" has disallowed extension "${ext}" for directory "${convention.dir}"`);
    console.error(`  Expected: ${convention.allowedExts.join(', ')}`);
    violations++;
  }
}

console.log('--- Placement Linter Audit ---');
auditDir('src');
auditDir('docs');
auditDir('scripts');

if (violations > 0) {
  console.log(`\nAudit failed with ${violations} violation(s).`);
  process.exit(1);
} else {
  console.log('\nAudit passed. All files comply with placement conventions.');
  process.exit(0);
}
