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

/**
 * Linux desktop installers build on glibc (ubuntu-22.04 → AppImage/deb). Musl
 * optional packages must not ship: linuxdeploy fails when it walks
 * `@img/sharp-linuxmusl-*` and cannot resolve `libc.musl-x86_64.so.1`.
 *
 * Returns true when `packageName` is a platform-specific optional native package
 * that does not belong on the packaging host. Pure JS packages return false.
 */
export function isForeignNativePackage(packageName, platform = process.platform, arch = process.arch) {
  const name = String(packageName).toLowerCase();

  // Musl ABI is never a desktop packaging target (glibc Linux, Windows, or macOS).
  // Covers `@img/sharp-linuxmusl-x64` and `@next/swc-linux-x64-musl`.
  if (name.includes('linuxmusl') || /(?:^|[-_/])musl(?:[-_/]|$)/.test(name)) {
    return true;
  }

  // Detect OS family tokens used by optional native packages (sharp, swc, esbuild…).
  // Check linuxmusl before linux; it is already handled above.
  const osFamilies = {
    darwin: /(?:^|[-/@_])(?:darwin|macos|osx)(?:[-_@/]|$)/,
    win32: /(?:^|[-/@_])(?:win32|windows)(?:[-_@/]|$)|(?:^|[-/@_])win-(?:x64|arm64|ia32|x86)/,
    linux: /(?:^|[-/@_])linux(?:[-_@/]|$)/,
    android: /(?:^|[-/@_])android(?:[-_@/]|$)/,
    freebsd: /(?:^|[-/@_])freebsd(?:[-_@/]|$)/,
    wasm32: /(?:^|[-/@_])wasm32(?:[-_@/]|$)/,
  };
  const presentOs = Object.entries(osFamilies)
    .filter(([, pattern]) => pattern.test(name))
    .map(([family]) => family);

  const hostOs = platform === 'win32' || platform === 'darwin' ? platform : 'linux';
  const hasOsSignal = presentOs.length > 0;
  const hasMsvc = /(?:^|[-_/])msvc(?:[-_/]|$)/.test(name);

  if (!hasOsSignal && !hasMsvc) return false;
  if (hasOsSignal && !presentOs.includes(hostOs)) return true;
  if (hasMsvc && hostOs !== 'win32') return true;

  // Wrong CPU architecture on an otherwise host-OS native package.
  const archPatterns = {
    x64: /(?:x64|x86_64|amd64)/,
    arm64: /(?:arm64|aarch64)/,
    arm: /(?:armv7|armhf|(?:^|[-_])arm(?:[-_]|$))/,
    ia32: /(?:ia32|i386|i686|(?:^|[-_])x86(?:[-_]|$))/,
    ppc64: /ppc64/,
    s390x: /s390x/,
    riscv64: /riscv64/,
  };
  const hostArchPattern = archPatterns[arch];
  if (!hostArchPattern || !hasOsSignal) return false;

  const matchesHostArch = hostArchPattern.test(name);
  const matchesOtherArch = Object.entries(archPatterns).some(
    ([token, pattern]) => token !== arch && pattern.test(name),
  );
  // Avoid arm64 matching the bare `arm` pattern above: if host is arm64 and
  // name contains arm64, it is not foreign solely due to the arm regex.
  if (matchesOtherArch && !matchesHostArch) return true;

  return false;
}

/**
 * Remove optional native packages for other OS/arch/ABI triples from a flattened
 * node_modules tree. Returns the list of removed package names.
 */
export function pruneForeignNativePackages(
  outputNodeModules,
  { platform = process.platform, arch = process.arch } = {},
) {
  if (!fs.existsSync(outputNodeModules)) return [];

  const removed = [];
  for (const candidate of packageEntries(outputNodeModules)) {
    const packageJson = path.join(candidate, 'package.json');
    if (!fs.existsSync(packageJson)) continue;
    let name;
    try {
      name = JSON.parse(fs.readFileSync(packageJson, 'utf8')).name;
    } catch {
      continue;
    }
    if (typeof name !== 'string' || !isForeignNativePackage(name, platform, arch)) continue;
    fs.rmSync(candidate, { recursive: true, force: true });
    removed.push(name);

    // Drop empty scope directories (e.g. @img after pruning all foreign sharps).
    const parent = path.dirname(candidate);
    if (path.basename(parent).startsWith('@')) {
      try {
        if (fs.readdirSync(parent).length === 0) fs.rmSync(parent, { recursive: true, force: true });
      } catch {
        // best-effort cleanup only
      }
    }
  }

  return removed.sort((a, b) => a.localeCompare(b));
}

export function stageStandalone({
  standaloneDir,
  staticDir,
  publicDir,
  outputDir,
  packageJsonPath,
  platform = process.platform,
  arch = process.arch,
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
  // Drop optional native binaries for other OS/arch/ABI triples. On Linux this
  // is required so AppImage linuxdeploy never walks musl sharp .node files.
  const prunedNativePackages = pruneForeignNativePackages(path.join(outputDir, 'node_modules'), {
    platform,
    arch,
  });
  for (const name of prunedNativePackages) packages.delete(name);

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
    prunedNativePackages,
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
