import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  archiveSpec,
  downloadOfficialNodeArchive,
  expectedChecksum,
  nodeDistUrl,
  pinnedArchiveSha256,
  pinnedBinarySha256,
  resolvePinnedNodeVersion,
  sha256File,
  verifyCachedSidecar,
  NODE_SIDECAR_PINS,
} from './prepare-node-runtime.mjs';
import {
  DESKTOP_IDENTIFIER,
  DESKTOP_PUBLISHER,
  DESKTOP_WIX_UPGRADE_CODE,
  readDesktopReleaseContract,
  validateDesktopReleaseTag,
} from './validate-release.mjs';
import {
  isForeignNativePackage,
  stageStandalone,
} from './stage-standalone.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('selects deterministic official Node archives for Windows and Linux', () => {
  assert.equal(
    archiveSpec('22.23.1', 'x86_64-pc-windows-msvc').archive,
    'node-v22.23.1-win-x64.zip',
  );
  assert.equal(
    archiveSpec('22.23.1', 'x86_64-unknown-linux-gnu').binary,
    'node-v22.23.1-linux-x64/bin/node',
  );
  assert.equal(
    expectedChecksum(`${'a'.repeat(64)}  node-v22.23.1-win-x64.zip\n`, 'node-v22.23.1-win-x64.zip'),
    'a'.repeat(64),
  );
});

test('pins Node sidecar downloads to compile-time SHA-256 digests', () => {
  assert.equal(resolvePinnedNodeVersion('22.23.1'), '22.23.1');
  assert.throws(() => resolvePinnedNodeVersion('99.0.0'), /Unpinned desktop Node version/);
  assert.equal(
    pinnedArchiveSha256('22.23.1', 'node-v22.23.1-linux-x64.tar.xz'),
    NODE_SIDECAR_PINS['22.23.1']['node-v22.23.1-linux-x64.tar.xz'].archiveSha256,
  );
  assert.equal(
    pinnedArchiveSha256('22.23.1', 'node-v22.23.1-win-x64.zip'),
    '7df0bc9375723f4a86b3aa1b7cc73342423d9677a8df4538aca31a049e309c29',
  );
  assert.equal(
    pinnedBinarySha256('22.23.1', 'node-v22.23.1-win-x64.zip'),
    'f8d162c0641dcee512132f3bcf8a68169c7ecb852efd8e1a46c9fec5a0f469ed',
  );
  assert.equal(
    nodeDistUrl('22.23.1', 'node-v22.23.1-linux-x64.tar.xz'),
    'https://nodejs.org/dist/v22.23.1/node-v22.23.1-linux-x64.tar.xz',
  );
  assert.throws(
    () => nodeDistUrl('22.23.1', 'node-v22.23.1-evil.tar.xz'),
    /No desktop Node pin/,
  );
  assert.throws(
    () => downloadOfficialNodeArchive('https://evil.example/node.tar.xz', path.join(os.tmpdir(), 'x')),
    /non-nodejs\.org origin/,
  );

  const pinProbe = fs.mkdtempSync(path.join(os.tmpdir(), 'mcop-pin-'));
  const probeFile = path.join(pinProbe, 'probe.bin');
  fs.writeFileSync(probeFile, 'mcop-desktop-pin-probe\n');
  assert.equal(
    sha256File(probeFile),
    crypto.createHash('sha256').update('mcop-desktop-pin-probe\n').digest('hex'),
  );
  fs.rmSync(pinProbe, { recursive: true, force: true });
});

test('trusts only v2 Node sidecar manifests whose executable still matches', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcop-sidecar-cache-'));
  const outputBinary = path.join(temp, 'node-x86_64-pc-windows-msvc.exe');
  const runtimeManifest = path.join(temp, 'node-x86_64-pc-windows-msvc.json');
  const binaryContents = 'verified desktop sidecar\n';
  const binarySha256 = crypto.createHash('sha256').update(binaryContents).digest('hex');
  const expected = {
    outputBinary,
    runtimeManifest,
    nodeVersion: '22.23.1',
    target: 'x86_64-pc-windows-msvc',
    archive: 'node-v22.23.1-win-x64.zip',
    archiveSha256: 'a'.repeat(64),
    binarySha256,
  };

  fs.writeFileSync(outputBinary, binaryContents);
  fs.writeFileSync(
    runtimeManifest,
    JSON.stringify({
      schema: 'mcop.desktop.node-sidecar/v1',
      nodeVersion: expected.nodeVersion,
      target: expected.target,
      archive: expected.archive,
      sha256: expected.archiveSha256,
    }),
  );
  assert.equal(verifyCachedSidecar(expected), null, 'v1 archive-only manifests must be rejected');

  const v2Manifest = {
    schema: 'mcop.desktop.node-sidecar/v2',
    nodeVersion: expected.nodeVersion,
    target: expected.target,
    archive: expected.archive,
    archiveSha256: expected.archiveSha256,
    binarySha256: expected.binarySha256,
  };
  fs.writeFileSync(runtimeManifest, JSON.stringify(v2Manifest));
  assert.deepEqual(verifyCachedSidecar(expected), v2Manifest);

  fs.appendFileSync(outputBinary, 'tampered\n');
  assert.equal(verifyCachedSidecar(expected), null, 'a modified cached executable must be rejected');
  fs.rmSync(temp, { recursive: true, force: true });
});

test('classifies optional native packages for glibc Linux packaging hosts', () => {
  assert.equal(isForeignNativePackage('@img/sharp-linuxmusl-x64', 'linux', 'x64'), true);
  assert.equal(isForeignNativePackage('@img/sharp-libvips-linuxmusl-x64', 'linux', 'x64'), true);
  assert.equal(isForeignNativePackage('@next/swc-linux-x64-musl', 'linux', 'x64'), true);
  assert.equal(isForeignNativePackage('@img/sharp-darwin-arm64', 'linux', 'x64'), true);
  assert.equal(isForeignNativePackage('@img/sharp-win32-x64', 'linux', 'x64'), true);
  assert.equal(isForeignNativePackage('@img/sharp-linux-arm64', 'linux', 'x64'), true);
  assert.equal(isForeignNativePackage('@img/sharp-linux-x64', 'linux', 'x64'), false);
  assert.equal(isForeignNativePackage('@img/sharp-libvips-linux-x64', 'linux', 'x64'), false);
  assert.equal(isForeignNativePackage('@next/swc-linux-x64-gnu', 'linux', 'x64'), false);
  assert.equal(isForeignNativePackage('sharp', 'linux', 'x64'), false);
  assert.equal(isForeignNativePackage('@img/sharp-win32-x64', 'win32', 'x64'), false);
  assert.equal(isForeignNativePackage('@img/sharp-linux-x64', 'win32', 'x64'), true);
});

test('stages a self-contained Next standalone tree', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcop-desktop-stage-'));
  const standaloneDir = path.join(temp, 'standalone');
  const staticDir = path.join(temp, 'static');
  const publicDir = path.join(temp, 'public');
  const outputDir = path.join(temp, 'output');
  fs.mkdirSync(standaloneDir);
  fs.mkdirSync(staticDir);
  fs.mkdirSync(publicDir);
  const tracedPackage = path.join(
    standaloneDir,
    'node_modules',
    '.pnpm',
    'styled-jsx@5.1.7',
    'node_modules',
    'styled-jsx',
  );
  const sharpMusl = path.join(
    standaloneDir,
    'node_modules',
    '.pnpm',
    '@img+sharp-linuxmusl-x64@0.34.5',
    'node_modules',
    '@img',
    'sharp-linuxmusl-x64',
  );
  const sharpLinux = path.join(
    standaloneDir,
    'node_modules',
    '.pnpm',
    '@img+sharp-linux-x64@0.34.5',
    'node_modules',
    '@img',
    'sharp-linux-x64',
  );
  fs.mkdirSync(tracedPackage, { recursive: true });
  fs.mkdirSync(sharpMusl, { recursive: true });
  fs.mkdirSync(sharpLinux, { recursive: true });
  fs.writeFileSync(path.join(standaloneDir, 'server.js'), 'console.log("ok")\n');
  fs.writeFileSync(
    path.join(tracedPackage, 'package.json'),
    '{"name":"styled-jsx","version":"5.1.7"}\n',
  );
  fs.writeFileSync(path.join(tracedPackage, 'index.js'), 'module.exports = {}\n');
  fs.writeFileSync(
    path.join(sharpMusl, 'package.json'),
    '{"name":"@img/sharp-linuxmusl-x64","version":"0.34.5"}\n',
  );
  fs.writeFileSync(path.join(sharpMusl, 'sharp-linuxmusl-x64.node'), 'musl\n');
  fs.writeFileSync(
    path.join(sharpLinux, 'package.json'),
    '{"name":"@img/sharp-linux-x64","version":"0.34.5"}\n',
  );
  fs.writeFileSync(path.join(sharpLinux, 'sharp-linux-x64.node'), 'glibc\n');
  fs.writeFileSync(path.join(staticDir, 'chunk.js'), 'export {}\n');
  fs.writeFileSync(path.join(publicDir, 'asset.txt'), 'asset\n');

  const manifest = stageStandalone({
    standaloneDir,
    staticDir,
    publicDir,
    outputDir,
    packageJsonPath: path.join(repoRoot, 'package.json'),
    // Exercise the Linux AppImage path that failed in CI: musl sharp must not ship.
    platform: 'linux',
    arch: 'x64',
  });
  assert.equal(manifest.appVersion, '2.4.0');
  assert.ok(fs.existsSync(path.join(outputDir, 'server.js')));
  assert.ok(fs.existsSync(path.join(outputDir, '.next', 'static', 'chunk.js')));
  assert.ok(fs.existsSync(path.join(outputDir, 'public', 'asset.txt')));
  assert.equal(fs.existsSync(path.join(outputDir, 'node_modules', '.pnpm')), false);
  assert.ok(fs.existsSync(path.join(outputDir, 'node_modules', 'styled-jsx', 'index.js')));
  assert.ok(fs.existsSync(path.join(outputDir, 'node_modules', '@img', 'sharp-linux-x64', 'sharp-linux-x64.node')));
  assert.equal(
    fs.existsSync(path.join(outputDir, 'node_modules', '@img', 'sharp-linuxmusl-x64')),
    false,
  );
  assert.deepEqual(manifest.prunedNativePackages, ['@img/sharp-linuxmusl-x64']);
  fs.rmSync(temp, { recursive: true, force: true });
});

test('desktop shell config owns a bundled Node sidecar and installer targets', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
  );
  const capability = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, 'apps/desktop/src-tauri/capabilities/default.json'),
      'utf8',
    ),
  );
  assert.deepEqual(config.bundle.externalBin, ['binaries/node']);
  assert.equal(config.app.windows[0].decorations, false);
  assert.deepEqual(config.plugins['deep-link'].desktop.schemes, ['mcop']);
  assert.match(config.build.beforeBuildCommand, /desktop:prepare/);
  assert.deepEqual(capability.remote.urls, ['http://127.0.0.1:*']);
  assert.equal(capability.permissions.some((permission) => /shell|process|fs:/.test(permission)), false);
  const nextConfig = fs.readFileSync(path.join(repoRoot, 'next.config.ts'), 'utf8');
  assert.match(nextConfig, /connect-src 'self' ipc: http:\/\/ipc\.localhost/);
});

test('desktop release identity and tag contract stay aligned across manifests', () => {
  const contract = readDesktopReleaseContract(repoRoot);
  const version = contract.versions.root;
  assert.deepEqual(new Set(Object.values(contract.versions)), new Set([version]));
  assert.equal(contract.identifier, DESKTOP_IDENTIFIER);
  assert.equal(contract.publisher, DESKTOP_PUBLISHER);
  assert.equal(contract.wixUpgradeCode, DESKTOP_WIX_UPGRADE_CODE);
  assert.equal(validateDesktopReleaseTag(`desktop-v${version}`, repoRoot).version, version);
  assert.throws(
    () => validateDesktopReleaseTag(`desktop-v${version}-invalid`, repoRoot),
    /does not match configured version/,
  );
});

test('desktop Node sidecar entry is relative (space-safe Windows install paths)', () => {
  // Regression: absolute `server.js` paths under `%LOCALAPPDATA%\MCOP Desktop`
  // were split on the space so Node saw `C:` and exited with EISDIR.
  const lib = fs.readFileSync(
    path.join(repoRoot, 'apps/desktop/src-tauri/src/lib.rs'),
    'utf8',
  );
  assert.match(
    lib,
    /const NODE_SERVER_ENTRY:\s*&str\s*=\s*"server\.js"/,
    'expected NODE_SERVER_ENTRY = "server.js"',
  );
  assert.match(lib, /\.arg\(NODE_SERVER_ENTRY\)/, 'sidecar must pass NODE_SERVER_ENTRY');
  assert.match(lib, /\.current_dir\(&root\)/, 'sidecar must set current_dir to server root');
  assert.equal(
    /\.arg\(server\.to_string_lossy\(\)/.test(lib),
    false,
    'must not pass absolute server path via to_string_lossy (breaks on spaces)',
  );
});
