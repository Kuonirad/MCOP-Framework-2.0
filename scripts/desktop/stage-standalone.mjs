#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requirePath(target, label) {
  if (!fs.existsSync(target)) {
    throw new Error(`${label} is missing at ${target}. Run \`pnpm build\` first.`);
  }
}

function packageEntries(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) return [];
  return fs.readdirSync(nodeModulesDir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) return [];
    const candidate = path.join(nodeModulesDir, entry.name);
    if (!entry.name.startsWith('@')) return [candidate];
    if (!fs.existsSync(candidate)) return [];
    return fs.readdirSync(candidate, { withFileTypes: true })
      .filter((child) => child.isDirectory() || child.isSymbolicLink())
      .map((child) => path.join(candidate, child.name));
  });
}

export function flattenPnpmRuntime(virtualStore, outputNodeModules) {
  const packages = new Map();
  if (!fs.existsSync(virtualStore)) return packages;

  for (const virtualEntry of fs.readdirSync(virtualStore, { withFileTypes: true })) {
    if (!virtualEntry.isDirectory()) continue;
    const nodeModulesDir = virtualEntry.name === 'node_modules'
      ? path.join(virtualStore, virtualEntry.name)
      : path.join(virtualStore, virtualEntry.name, 'node_modules');
    for (const candidate of packageEntries(nodeModulesDir)) {
      const real = fs.realpathSync(candidate);
      const packageJson = path.join(real, 'package.json');
      if (!fs.existsSync(packageJson)) continue;
      const metadata = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
      if (typeof metadata.name !== 'string' || typeof metadata.version !== 'string') continue;
      const previous = packages.get(metadata.name);
      if (previous && previous.version !== metadata.version) {
        throw new Error(
          `Cannot flatten ${metadata.name}: runtime trace contains both ${previous.version} and ${metadata.version}`,
        );
      }
      packages.set(metadata.name, { source: real, version: metadata.version });
    }
  }

  for (const [name, metadata] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const destination = path.join(outputNodeModules, ...name.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(metadata.source, destination, { recursive: true, dereference: true });
  }
  return packages;
}

export function stageStandalone({
  standaloneDir,
  staticDir,
  publicDir,
  outputDir,
  packageJsonPath,
}) {
  requirePath(path.join(standaloneDir, 'server.js'), 'Next standalone entrypoint');
  requirePath(staticDir, 'Next static assets');
  requirePath(publicDir, 'Public assets');

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  // Next standalone output produced from a pnpm workspace contains a deeply
  // nested `.pnpm` virtual store. NSIS cannot reliably package those paths on
  // Windows. Copy the application files without node_modules, then flatten the
  // small traced runtime graph into a conventional top-level node_modules.
  const virtualStore = path.join(standaloneDir, 'node_modules', '.pnpm');
  const standaloneNodeModules = path.join(standaloneDir, 'node_modules');
  fs.cpSync(standaloneDir, outputDir, {
    recursive: true,
    dereference: true,
    filter(source) {
      return source !== standaloneNodeModules && !source.startsWith(`${standaloneNodeModules}${path.sep}`);
    },
  });
  const packages = flattenPnpmRuntime(virtualStore, path.join(outputDir, 'node_modules'));
  if (packages.size === 0 && fs.existsSync(standaloneNodeModules)) {
    throw new Error('Next standalone node_modules trace could not be flattened');
  }
  fs.cpSync(publicDir, path.join(outputDir, 'public'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, '.next'), { recursive: true });
  fs.cpSync(staticDir, path.join(outputDir, '.next', 'static'), { recursive: true });

  const legalDir = path.join(outputDir, 'legal');
  fs.mkdirSync(legalDir, { recursive: true });
  for (const name of ['LICENSE', 'NOTICE.md', 'LICENSE-MIT-LEGACY']) {
    const source = path.join(repoRoot, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(legalDir, name));
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const manifest = {
    schema: 'mcop.desktop.runtime/v1',
    appVersion: pkg.version,
    nodeVersion: fs.readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8').trim(),
    entrypoint: 'server.js',
    healthPath: '/api/health',
    runtimePackages: packages.size,
  };
  fs.writeFileSync(
    path.join(outputDir, 'desktop-runtime.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedUrl) {
  const output = path.resolve(repoRoot, argumentValue('--output', 'dist/standalone'));
  const manifest = stageStandalone({
    standaloneDir: path.join(repoRoot, '.next', 'standalone'),
    staticDir: path.join(repoRoot, '.next', 'static'),
    publicDir: path.join(repoRoot, 'public'),
    outputDir: output,
    packageJsonPath: path.join(repoRoot, 'package.json'),
  });
  console.log(`Staged MCOP ${manifest.appVersion} standalone runtime at ${output}`);
}
