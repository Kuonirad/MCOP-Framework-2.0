import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertReleaseAssetsMatch,
  releaseAssetRecords,
  stageReleaseAssets,
} from './stage-release-assets.mjs';
import {
  verifyChecksumManifest,
  writeInstallerChecksums,
} from './write-checksums.mjs';

function writeFixture(file, contents = path.basename(file)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${contents}\n`);
}

test('stages four flat installer classes with basename-only verified checksums', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcop-release-assets-'));
  const source = path.join(temp, 'artifacts');
  const linux = path.join(source, 'linux', 'target', 'bundle');
  const windows = path.join(source, 'windows', 'target', 'bundle');
  const output = path.join(temp, 'release-assets');

  writeFixture(path.join(linux, 'appimage', 'MCOP_2.4.0_amd64.AppImage'));
  writeFixture(path.join(linux, 'deb', 'MCOP_2.4.0_amd64.deb'));
  writeFixture(path.join(windows, 'nsis', 'MCOP_2.4.0_x64-setup.exe'));
  writeFixture(path.join(windows, 'msi', 'MCOP_2.4.0_x64_en-US.msi'));
  writeInstallerChecksums(linux, 'linux');
  writeInstallerChecksums(windows, 'win32');

  for (const manifest of [
    path.join(linux, 'SHA256SUMS-linux.txt'),
    path.join(windows, 'SHA256SUMS-win32.txt'),
  ]) {
    const contents = fs.readFileSync(manifest, 'utf8');
    assert.equal(/  .*[/\\]/.test(contents), false, 'release checksums must use flat basenames');
  }

  const staged = stageReleaseAssets(source, output);
  assert.equal(staged.installers.length, 4);
  assert.equal(staged.checksums.length, 2);
  assert.deepEqual(
    fs.readdirSync(output).sort(),
    [
      'MCOP_2.4.0_amd64.AppImage',
      'MCOP_2.4.0_amd64.deb',
      'MCOP_2.4.0_x64-setup.exe',
      'MCOP_2.4.0_x64_en-US.msi',
      'SHA256SUMS-linux.txt',
      'SHA256SUMS-win32.txt',
    ].sort(),
  );
  verifyChecksumManifest(path.join(output, 'SHA256SUMS-linux.txt'), output);
  verifyChecksumManifest(path.join(output, 'SHA256SUMS-win32.txt'), output);

  const records = releaseAssetRecords(output);
  assert.equal(records.length, 6);
  assert.deepEqual(assertReleaseAssetsMatch(output, records), records);
  assert.throws(
    () => assertReleaseAssetsMatch(output, records.slice(0, -1)),
    /do not match staged files/,
  );
  assert.throws(
    () => assertReleaseAssetsMatch(output, [
      ...records.slice(0, -1),
      { ...records.at(-1), digest: `sha256:${'0'.repeat(64)}` },
    ]),
    /do not match staged files/,
  );

  fs.appendFileSync(path.join(output, 'MCOP_2.4.0_amd64.AppImage'), 'tampered\n');
  assert.throws(
    () => verifyChecksumManifest(path.join(output, 'SHA256SUMS-linux.txt'), output),
    /Checksum mismatch/,
  );
  fs.rmSync(temp, { recursive: true, force: true });
});

test('rejects release assets with colliding flat basenames', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcop-release-collision-'));
  const source = path.join(temp, 'artifacts');
  writeFixture(path.join(source, 'one', 'MCOP-setup.exe'), 'one');
  writeFixture(path.join(source, 'two', 'MCOP-setup.exe'), 'two');
  writeFixture(path.join(source, 'MCOP.msi'));
  writeFixture(path.join(source, 'MCOP.AppImage'));
  writeFixture(path.join(source, 'MCOP.deb'));

  assert.throws(
    () => stageReleaseAssets(source, path.join(temp, 'release-assets')),
    /basename collision/,
  );
  fs.rmSync(temp, { recursive: true, force: true });
});
