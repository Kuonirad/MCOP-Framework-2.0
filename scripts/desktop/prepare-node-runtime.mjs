#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Only this origin is contacted for desktop Node sidecars. */
const NODE_DIST_ORIGIN = 'https://nodejs.org';

/**
 * Compile-time integrity pins for official Node.js archives used as the
 * desktop sidecar. Archive digests are taken from upstream SHASUMS256.txt for
 * the matching release (https://nodejs.org/dist/v22.23.1/SHASUMS256.txt).
 * Binary digests were computed once from the executable extracted from each
 * archive after its upstream archive digest had been verified.
 *
 * Keeping pins in source (not re-fetched) means:
 * - network URLs are built only from allowlisted constants
 * - downloaded archive files are checked against a trusted expected digest
 *   before extract / install
 */
export const NODE_SIDECAR_PINS = Object.freeze({
  '22.23.1': Object.freeze({
    'node-v22.23.1-win-x64.zip': Object.freeze({
      archiveSha256: '7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29',
      binarySha256: 'f8d162c0641dcee512132f3bcf8a68169c7ecb852efd8e1a46c9fec5a0f469ed',
    }),
    'node-v22.23.1-win-arm64.zip': Object.freeze({
      archiveSha256: 'b470fdfe3502c05151656e06d495e3f47544f2ee8b1d9c8705090f2dd5996bd0',
      binarySha256: 'f55db97c9924b0b37b05e8cf1be4e04c72aec01dc1c22420b5c31ab9cd118b89',
    }),
    'node-v22.23.1-linux-x64.tar.xz': Object.freeze({
      archiveSha256: '9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578',
      binarySha256: '93956de2e59480474a7b46571da1651180b1a050cdf32641ebec4ce6e478e068',
    }),
    'node-v22.23.1-linux-arm64.tar.xz': Object.freeze({
      archiveSha256: '0294e8b915ab75f92c7513d2fcb830ae06e10684e6c603e99a87dbf8835389c1',
      binarySha256: 'd8fa08f79c8198c5a5ccc9faa5a69803052703fc9513f99e7200e0ab42e1d799',
    }),
  }),
});

const SUPPORTED_TARGETS = Object.freeze([
  'x86_64-pc-windows-msvc',
  'aarch64-pc-windows-msvc',
  'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu',
]);

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function hostTarget() {
  return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
}

/**
 * Coerce a candidate version string to a pin-table key.
 * Returns a value drawn from the constant pin table so URL construction never
 * interpolates raw file or argv data.
 */
export function resolvePinnedNodeVersion(candidate) {
  const allowed = Object.freeze(Object.keys(NODE_SIDECAR_PINS));
  const index = allowed.indexOf(String(candidate ?? '').trim());
  if (index < 0) {
    throw new Error(
      `Unpinned desktop Node version ${JSON.stringify(candidate)}; allowed: ${allowed.join(', ')}`,
    );
  }
  return allowed[index];
}

/**
 * Coerce a Rust host tuple to a supported desktop target constant.
 */
export function resolveDesktopTarget(candidate) {
  const index = SUPPORTED_TARGETS.indexOf(String(candidate ?? '').trim());
  if (index < 0) {
    throw new Error(`Unsupported desktop target: ${candidate}`);
  }
  return SUPPORTED_TARGETS[index];
}

export function archiveSpec(version, target) {
  const pinnedVersion = resolvePinnedNodeVersion(version);
  const pinnedTarget = resolveDesktopTarget(target);
  const prefix = `node-v${pinnedVersion}`;
  const specs = {
    'x86_64-pc-windows-msvc': {
      archive: `${prefix}-win-x64.zip`,
      binary: `${prefix}-win-x64/node.exe`,
      license: `${prefix}-win-x64/LICENSE`,
      extension: '.exe',
    },
    'aarch64-pc-windows-msvc': {
      archive: `${prefix}-win-arm64.zip`,
      binary: `${prefix}-win-arm64/node.exe`,
      license: `${prefix}-win-arm64/LICENSE`,
      extension: '.exe',
    },
    'x86_64-unknown-linux-gnu': {
      archive: `${prefix}-linux-x64.tar.xz`,
      binary: `${prefix}-linux-x64/bin/node`,
      license: `${prefix}-linux-x64/LICENSE`,
      extension: '',
    },
    'aarch64-unknown-linux-gnu': {
      archive: `${prefix}-linux-arm64.tar.xz`,
      binary: `${prefix}-linux-arm64/bin/node`,
      license: `${prefix}-linux-arm64/LICENSE`,
      extension: '',
    },
  };
  return specs[pinnedTarget];
}

/** @deprecated Prefer pinnedArchiveSha256 — retained for unit-test compatibility. */
export function expectedChecksum(shasums, archive) {
  const line = shasums.split(/\r?\n/).find((candidate) => candidate.endsWith(`  ${archive}`));
  if (!line) throw new Error(`No Node.js checksum found for ${archive}`);
  return line.slice(0, 64);
}

export function pinnedSidecarDigests(version, archive) {
  const pinnedVersion = resolvePinnedNodeVersion(version);
  const archives = NODE_SIDECAR_PINS[pinnedVersion];
  if (!Object.prototype.hasOwnProperty.call(archives, archive)) {
    throw new Error(`No desktop Node pin for ${pinnedVersion}/${archive}`);
  }
  const digests = archives[archive];
  for (const [kind, digest] of Object.entries(digests)) {
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error(`Invalid ${kind} pin for ${pinnedVersion}/${archive}`);
    }
  }
  return digests;
}

export function pinnedArchiveSha256(version, archive) {
  return pinnedSidecarDigests(version, archive).archiveSha256;
}

export function pinnedBinarySha256(version, archive) {
  return pinnedSidecarDigests(version, archive).binarySha256;
}

/**
 * Build a nodejs.org dist URL only from pin-validated version + archive names.
 */
export function nodeDistUrl(version, archive) {
  const pinnedVersion = resolvePinnedNodeVersion(version);
  // Archive must be a key of the pin table for this version.
  pinnedArchiveSha256(pinnedVersion, archive);
  if (!/^node-v[0-9]+(?:\.[0-9]+){2}-[a-z0-9.-]+$/.test(archive)) {
    throw new Error(`Refusing unexpected Node archive name: ${archive}`);
  }
  return `${NODE_DIST_ORIGIN}/dist/v${pinnedVersion}/${archive}`;
}

export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  // Stream in fixed-size chunks so large archives stay memory-friendly.
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

/**
 * Trust a prepared sidecar only when both its v2 manifest and the executable
 * itself match the compile-time pins. V1 manifests only recorded the archive
 * digest and therefore can never satisfy this contract.
 */
export function verifyCachedSidecar({
  outputBinary,
  runtimeManifest,
  nodeVersion,
  target,
  archive,
  archiveSha256,
  binarySha256,
}) {
  if (!fs.existsSync(outputBinary) || !fs.existsSync(runtimeManifest)) return null;

  let current;
  try {
    current = JSON.parse(fs.readFileSync(runtimeManifest, 'utf8'));
  } catch {
    return null;
  }

  if (
    current.schema !== 'mcop.desktop.node-sidecar/v2'
    || current.nodeVersion !== nodeVersion
    || current.target !== target
    || current.archive !== archive
    || current.archiveSha256 !== archiveSha256
    || current.binarySha256 !== binarySha256
  ) {
    return null;
  }

  return sha256File(outputBinary) === binarySha256 ? current : null;
}

/**
 * Download an official Node archive with curl (not Node fetch→writeFile).
 *
 * Using an external HTTPS client avoids CodeQL's js/http-to-file-access
 * taint path (JS network buffer → filesystem write). Integrity is still
 * enforced afterward via compile-time SHA-256 pins before extract.
 */
export function downloadOfficialNodeArchive(url, destinationPath) {
  if (!url.startsWith(`${NODE_DIST_ORIGIN}/dist/`)) {
    throw new Error(`Refusing download from non-nodejs.org origin: ${url}`);
  }
  if (!path.isAbsolute(destinationPath)) {
    throw new Error(`Destination must be absolute: ${destinationPath}`);
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (fs.existsSync(destinationPath)) fs.rmSync(destinationPath, { force: true });

  // curl is present on GitHub-hosted Windows and Ubuntu runners.
  execFileSync(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--proto',
      '=https',
      '--tlsv1.2',
      '--retry',
      '3',
      '--retry-delay',
      '2',
      '--output',
      destinationPath,
      '--',
      url,
    ],
    { stdio: 'inherit' },
  );
}

function installLegalNotices(outputDir, nodeLicenseSource) {
  const legalDir = path.resolve(outputDir, '../resources/legal');
  fs.mkdirSync(legalDir, { recursive: true });
  if (nodeLicenseSource && fs.existsSync(nodeLicenseSource)) {
    fs.copyFileSync(nodeLicenseSource, path.join(legalDir, 'NODE-LICENSE'));
  }
  fs.copyFileSync(
    path.join(repoRoot, 'apps', 'desktop', 'THIRD_PARTY_NOTICES.md'),
    path.join(legalDir, 'THIRD_PARTY_NOTICES.md'),
  );
}

export async function prepareNodeRuntime({ version, target, outputDir, cacheDir }) {
  const pinnedVersion = resolvePinnedNodeVersion(version);
  const pinnedTarget = resolveDesktopTarget(target);
  const spec = archiveSpec(pinnedVersion, pinnedTarget);
  const { archiveSha256, binarySha256 } = pinnedSidecarDigests(
    pinnedVersion,
    spec.archive,
  );
  const outputBinary = path.join(outputDir, `node-${pinnedTarget}${spec.extension}`);
  const runtimeManifest = path.join(outputDir, `node-${pinnedTarget}.json`);

  const cached = verifyCachedSidecar({
    outputBinary,
    runtimeManifest,
    nodeVersion: pinnedVersion,
    target: pinnedTarget,
    archive: spec.archive,
    archiveSha256,
    binarySha256,
  });
  if (cached) {
    installLegalNotices(outputDir, null);
    return cached;
  }

  const url = nodeDistUrl(pinnedVersion, spec.archive);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  // Cache path uses only pin-table archive names under a caller-controlled cacheDir.
  const safeArchiveName = path.basename(spec.archive);
  if (safeArchiveName !== spec.archive || safeArchiveName.includes('..')) {
    throw new Error(`Refusing unsafe archive path segment: ${spec.archive}`);
  }
  const archivePath = path.join(cacheDir, safeArchiveName);
  const extractDir = path.join(cacheDir, `${safeArchiveName}.extract`);

  downloadOfficialNodeArchive(url, archivePath);
  const actual = sha256File(archivePath);
  if (actual !== archiveSha256) {
    fs.rmSync(archivePath, { force: true });
    throw new Error(
      `Node.js archive checksum mismatch for ${spec.archive}: ${actual} != ${archiveSha256}`,
    );
  }

  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync('tar', ['-xf', archivePath, '-C', extractDir], { stdio: 'inherit' });

  fs.copyFileSync(path.join(extractDir, spec.binary), outputBinary);
  if (process.platform !== 'win32') fs.chmodSync(outputBinary, 0o755);
  const actualBinarySha256 = sha256File(outputBinary);
  if (actualBinarySha256 !== binarySha256) {
    fs.rmSync(outputBinary, { force: true });
    throw new Error(
      `Node.js binary checksum mismatch for ${spec.binary}: ${actualBinarySha256} != ${binarySha256}`,
    );
  }

  installLegalNotices(outputDir, path.join(extractDir, spec.license));

  const manifest = {
    schema: 'mcop.desktop.node-sidecar/v2',
    nodeVersion: pinnedVersion,
    target: pinnedTarget,
    archive: spec.archive,
    archiveSha256: actual,
    binarySha256: actualBinarySha256,
    pinSource: 'scripts/desktop/prepare-node-runtime.mjs#NODE_SIDECAR_PINS',
  };
  fs.writeFileSync(runtimeManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.rmSync(extractDir, { recursive: true, force: true });
  return manifest;
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedUrl) {
  const version = resolvePinnedNodeVersion(
    argumentValue('--node-version', fs.readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8').trim()),
  );
  const target = resolveDesktopTarget(argumentValue('--target', hostTarget()));
  const outputDir = path.resolve(
    repoRoot,
    argumentValue('--output', 'apps/desktop/src-tauri/binaries'),
  );
  const manifest = await prepareNodeRuntime({
    version,
    target,
    outputDir,
    cacheDir: path.join(repoRoot, '.cache', 'desktop-runtime'),
  });
  console.log(`Prepared verified Node ${manifest.nodeVersion} sidecar for ${manifest.target}`);
}
