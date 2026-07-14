#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  INSTALLER_EXTENSIONS,
  assertUniqueBasenames,
  filesUnder,
  installerFilesUnder,
  sha256File,
  verifyChecksumManifest,
} from './write-checksums.mjs';

const REQUIRED_CHECKSUMS = Object.freeze(['SHA256SUMS-linux.txt', 'SHA256SUMS-win32.txt']);

export function releaseAssetRecords(releaseRoot) {
  const root = path.resolve(releaseRoot);
  const files = filesUnder(root);
  if (files.some((file) => path.dirname(path.resolve(file)) !== root)) {
    throw new Error(`Release assets must be flat files directly under ${root}`);
  }
  assertUniqueBasenames(files);
  return files
    .map((file) => ({
      name: path.basename(file),
      digest: `sha256:${sha256File(file)}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function assertReleaseAssetsMatch(releaseRoot, remoteAssets) {
  const expected = releaseAssetRecords(releaseRoot);
  if (expected.length !== INSTALLER_EXTENSIONS.length + REQUIRED_CHECKSUMS.length) {
    throw new Error(`Expected exactly six staged desktop release assets; got ${expected.length}`);
  }
  if (!Array.isArray(remoteAssets)) throw new Error('Published release assets must be an array');

  const names = new Set();
  const actual = remoteAssets.map((asset) => {
    if (!asset || typeof asset.name !== 'string' || typeof asset.digest !== 'string') {
      throw new Error('Published release asset is missing a name or GitHub digest');
    }
    if (names.has(asset.name)) throw new Error(`Published release has duplicate asset ${asset.name}`);
    names.add(asset.name);
    return { name: asset.name, digest: asset.digest };
  }).sort((a, b) => a.name.localeCompare(b.name));

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Published release assets do not match staged files:\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`,
    );
  }
  return expected;
}

function assertExactInstallerClasses(installers) {
  const counts = new Map(INSTALLER_EXTENSIONS.map((extension) => [extension, 0]));
  for (const installer of installers) {
    const extension = path.extname(installer).toLowerCase();
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }
  const invalid = [...counts].filter(([, count]) => count !== 1);
  if (installers.length !== INSTALLER_EXTENSIONS.length || invalid.length > 0) {
    const summary = [...counts].map(([extension, count]) => `${extension}=${count}`).join(', ');
    throw new Error(`Expected exactly one installer of each release class (${summary})`);
  }
}

export function stageReleaseAssets(sourceRoot, outputRoot) {
  const installers = installerFilesUnder(sourceRoot);
  assertUniqueBasenames(installers);
  assertExactInstallerClasses(installers);

  const checksumFiles = filesUnder(sourceRoot)
    .filter((file) => /^SHA256SUMS-(?:linux|win32)\.txt$/.test(path.basename(file)))
    .sort((a, b) => a.localeCompare(b));
  const checksumNames = checksumFiles.map((file) => path.basename(file)).sort();
  if (JSON.stringify(checksumNames) !== JSON.stringify([...REQUIRED_CHECKSUMS].sort())) {
    throw new Error(`Expected checksum manifests ${REQUIRED_CHECKSUMS.join(', ')}; got ${checksumNames.join(', ')}`);
  }

  const releaseFiles = [...installers, ...checksumFiles];
  assertUniqueBasenames(releaseFiles);
  if (fs.existsSync(outputRoot) && fs.readdirSync(outputRoot).length > 0) {
    throw new Error(`Release staging directory must be empty: ${outputRoot}`);
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const file of releaseFiles) {
    fs.copyFileSync(file, path.join(outputRoot, path.basename(file)));
  }

  const covered = new Set();
  for (const checksumName of REQUIRED_CHECKSUMS) {
    const entries = verifyChecksumManifest(path.join(outputRoot, checksumName), outputRoot);
    for (const { basename } of entries) {
      if (covered.has(basename)) throw new Error(`Installer appears in multiple checksum manifests: ${basename}`);
      covered.add(basename);
    }
  }

  const installerNames = installers.map((file) => path.basename(file)).sort();
  const coveredNames = [...covered].sort();
  if (JSON.stringify(installerNames) !== JSON.stringify(coveredNames)) {
    throw new Error(`Checksum coverage mismatch: installers=${installerNames.join(', ')} checksums=${coveredNames.join(', ')}`);
  }

  return {
    installers: installerNames.map((basename) => path.join(outputRoot, basename)),
    checksums: REQUIRED_CHECKSUMS.map((basename) => path.join(outputRoot, basename)),
  };
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedUrl) {
  const sourceRoot = path.resolve(process.argv[2] ?? 'artifacts');
  const outputRoot = path.resolve(process.argv[3] ?? 'release-assets');
  const staged = stageReleaseAssets(sourceRoot, outputRoot);
  console.log(
    `Staged and verified ${staged.installers.length} installers and ${staged.checksums.length} checksum manifests in ${outputRoot}`,
  );
}
