import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { archiveSpec, expectedChecksum } from './prepare-node-runtime.mjs';
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
