#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const INSTALLER_EXTENSIONS = Object.freeze(['.msi', '.exe', '.appimage', '.deb']);
const installerExtensions = new Set(INSTALLER_EXTENSIONS);

export function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  });
}

export function installerFilesUnder(dir) {
  return filesUnder(dir)
    .filter((file) => installerExtensions.has(path.extname(file).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export function assertUniqueBasenames(files) {
  const seen = new Map();
  for (const file of files) {
    const basename = path.basename(file);
    const previous = seen.get(basename);
    if (previous) {
      throw new Error(`Release asset basename collision for ${basename}: ${previous} and ${file}`);
    }
    seen.set(basename, file);
  }
  return seen;
}

export function parseChecksumManifest(contents, manifestName = 'checksum manifest') {
  const lines = contents.trimEnd().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error(`${manifestName} is empty`);

  const seen = new Set();
  return lines.map((line) => {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`Invalid checksum line in ${manifestName}: ${line}`);
    const [, digest, basename] = match;
    if (path.basename(basename) !== basename || basename.includes('/') || basename.includes('\\')) {
      throw new Error(`Checksum entry must be a flat release basename: ${basename}`);
    }
    if (seen.has(basename)) throw new Error(`Duplicate checksum entry for ${basename}`);
    seen.add(basename);
    return { digest, basename };
  });
}

export function verifyChecksumManifest(manifestPath, artifactRoot = path.dirname(manifestPath)) {
  const entries = parseChecksumManifest(
    fs.readFileSync(manifestPath, 'utf8'),
    path.basename(manifestPath),
  );
  for (const { digest, basename } of entries) {
    const artifact = path.join(artifactRoot, basename);
    if (!fs.existsSync(artifact) || !fs.statSync(artifact).isFile()) {
      throw new Error(`Checksum entry ${basename} has no release asset in ${artifactRoot}`);
    }
    const actual = sha256File(artifact);
    if (actual !== digest) {
      throw new Error(`Checksum mismatch for ${basename}: ${actual} != ${digest}`);
    }
  }
  return entries;
}

export function writeInstallerChecksums(
  bundleRoot,
  platform = process.platform,
) {
  if (!/^[a-z0-9._-]+$/i.test(platform)) throw new Error(`Invalid platform label: ${platform}`);
  const artifacts = installerFilesUnder(bundleRoot);
  if (artifacts.length === 0) throw new Error(`No desktop installers found under ${bundleRoot}`);
  assertUniqueBasenames(artifacts);

  const lines = artifacts.map((file) => `${sha256File(file)}  ${path.basename(file)}`);
  const output = path.join(bundleRoot, `SHA256SUMS-${platform}.txt`);
  fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');

  // Verify what was written against the nested source files by staging a
  // basename lookup. Release assembly performs the same verification after
  // flattening; this catches writer regressions in the platform build job.
  const byBasename = assertUniqueBasenames(artifacts);
  for (const { digest, basename } of parseChecksumManifest(fs.readFileSync(output, 'utf8'), output)) {
    const actual = sha256File(byBasename.get(basename));
    if (actual !== digest) throw new Error(`Checksum self-verification failed for ${basename}`);
  }

  return { output, artifacts };
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedUrl) {
  const bundleRoot = path.resolve(
    repoRoot,
    process.argv[2] ?? 'apps/desktop/src-tauri/target/release/bundle',
  );
  const { output, artifacts } = writeInstallerChecksums(bundleRoot);
  console.log(`Wrote and verified ${artifacts.length} installer checksum(s) to ${output}`);
}
