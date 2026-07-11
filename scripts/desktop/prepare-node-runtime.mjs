#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function hostTarget() {
  return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
}

export function archiveSpec(version, target) {
  const prefix = `node-v${version}`;
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
  const spec = specs[target];
  if (!spec) throw new Error(`Unsupported desktop target: ${target}`);
  return spec;
}

export function expectedChecksum(shasums, archive) {
  const line = shasums.split(/\r?\n/).find((candidate) => candidate.endsWith(`  ${archive}`));
  if (!line) throw new Error(`No Node.js checksum found for ${archive}`);
  return line.slice(0, 64);
}

async function fetchOk(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  return response;
}

export async function prepareNodeRuntime({ version, target, outputDir, cacheDir }) {
  const spec = archiveSpec(version, target);
  const outputBinary = path.join(outputDir, `node-${target}${spec.extension}`);
  const runtimeManifest = path.join(outputDir, `node-${target}.json`);

  if (fs.existsSync(outputBinary) && fs.existsSync(runtimeManifest)) {
    const current = JSON.parse(fs.readFileSync(runtimeManifest, 'utf8'));
    if (current.nodeVersion === version && current.target === target) {
      const legalDir = path.resolve(outputDir, '../resources/legal');
      fs.mkdirSync(legalDir, { recursive: true });
      fs.copyFileSync(
        path.join(repoRoot, 'apps', 'desktop', 'THIRD_PARTY_NOTICES.md'),
        path.join(legalDir, 'THIRD_PARTY_NOTICES.md'),
      );
      return current;
    }
  }

  const baseUrl = `https://nodejs.org/dist/v${version}`;
  const shasums = await (await fetchOk(`${baseUrl}/SHASUMS256.txt`)).text();
  const expected = expectedChecksum(shasums, spec.archive);
  const response = await fetchOk(`${baseUrl}/${spec.archive}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new Error(`Node.js runtime checksum mismatch for ${spec.archive}: ${actual} != ${expected}`);
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const archivePath = path.join(cacheDir, spec.archive);
  const extractDir = path.join(cacheDir, `${spec.archive}.extract`);
  fs.writeFileSync(archivePath, bytes);
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync('tar', ['-xf', archivePath, '-C', extractDir], { stdio: 'inherit' });

  fs.copyFileSync(path.join(extractDir, spec.binary), outputBinary);
  if (process.platform !== 'win32') fs.chmodSync(outputBinary, 0o755);

  const legalDir = path.resolve(outputDir, '../resources/legal');
  fs.mkdirSync(legalDir, { recursive: true });
  fs.copyFileSync(path.join(extractDir, spec.license), path.join(legalDir, 'NODE-LICENSE'));
  fs.copyFileSync(
    path.join(repoRoot, 'apps', 'desktop', 'THIRD_PARTY_NOTICES.md'),
    path.join(legalDir, 'THIRD_PARTY_NOTICES.md'),
  );

  const manifest = {
    schema: 'mcop.desktop.node-sidecar/v1',
    nodeVersion: version,
    target,
    archive: spec.archive,
    sha256: actual,
  };
  fs.writeFileSync(runtimeManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.rmSync(extractDir, { recursive: true, force: true });
  return manifest;
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedUrl) {
  const version = argumentValue('--node-version', fs.readFileSync(path.join(repoRoot, '.nvmrc'), 'utf8').trim());
  const target = argumentValue('--target', hostTarget());
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
