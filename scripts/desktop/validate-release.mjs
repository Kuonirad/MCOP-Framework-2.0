#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DESKTOP_IDENTIFIER = 'ai.kullailabs.mcop';
export const DESKTOP_PUBLISHER = 'KullAI Labs';
export const DESKTOP_WIX_UPGRADE_CODE = '32fe4b4a-7ef1-5835-8ed5-f8426140a80e';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cargoPackageVersion(cargoToml) {
  const match = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(cargoToml, 'utf8'));
  if (!match) throw new Error(`Could not read package version from ${cargoToml}`);
  return match[1];
}

export function readDesktopReleaseContract(root = repoRoot) {
  const rootPackage = readJson(path.join(root, 'package.json'));
  const desktopPackage = readJson(path.join(root, 'apps/desktop/package.json'));
  const tauriConfig = readJson(path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'));
  const cargoVersion = cargoPackageVersion(path.join(root, 'apps/desktop/src-tauri/Cargo.toml'));
  return {
    versions: {
      root: rootPackage.version,
      desktopPackage: desktopPackage.version,
      tauri: tauriConfig.version,
      cargo: cargoVersion,
    },
    identifier: tauriConfig.identifier,
    publisher: tauriConfig.bundle.publisher,
    wixUpgradeCode: tauriConfig.bundle.windows?.wix?.upgradeCode,
  };
}

export function validateDesktopReleaseTag(tag, root = repoRoot) {
  const contract = readDesktopReleaseContract(root);
  const uniqueVersions = new Set(Object.values(contract.versions));
  if (uniqueVersions.size !== 1) {
    throw new Error(`Desktop release version mismatch: ${JSON.stringify(contract.versions)}`);
  }
  const [version] = uniqueVersions;
  if (tag !== `desktop-v${version}`) {
    throw new Error(`Desktop release tag ${tag} does not match configured version ${version}`);
  }
  if (contract.identifier !== DESKTOP_IDENTIFIER) {
    throw new Error(`Desktop identifier must be ${DESKTOP_IDENTIFIER}; got ${contract.identifier}`);
  }
  if (contract.publisher !== DESKTOP_PUBLISHER) {
    throw new Error(`Desktop publisher must be ${DESKTOP_PUBLISHER}; got ${contract.publisher}`);
  }
  if (contract.wixUpgradeCode !== DESKTOP_WIX_UPGRADE_CODE) {
    throw new Error(`Desktop WiX upgrade code must remain ${DESKTOP_WIX_UPGRADE_CODE}`);
  }
  return { version, ...contract };
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (import.meta.url === invokedUrl) {
  const tag = process.argv[2];
  if (!tag) throw new Error('Usage: node scripts/desktop/validate-release.mjs desktop-v<version>');
  const contract = validateDesktopReleaseTag(tag);
  console.log(`Validated MCOP Desktop ${contract.version} release contract for ${tag}`);
}
