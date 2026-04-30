#!/usr/bin/env node
// scripts/validate-sbom.mjs
//
// Validates each generated CycloneDX SBOM under docs/sbom/ against the
// official CycloneDX JSON schema bundled with @cyclonedx/cyclonedx-library.
// The script reads each SBOM's `specVersion` field and validates against the
// matching schema (1.0 through 1.7 are supported by the library).
//
// Usage:
//   pnpm sbom:validate                        # validate the default targets
//   node scripts/validate-sbom.mjs <path>...  # validate specific files
//
// Exit codes:
//   0  all SBOMs are valid CycloneDX (per their own specVersion)
//   1  one or more SBOMs failed schema validation
//   2  IO / parse / setup error (missing file, unsupported specVersion, etc.)

import { Validation, Spec } from "@cyclonedx/cyclonedx-library";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

const DEFAULT_TARGETS = [
  "docs/sbom/mcop-framework.cdx.json",
  "docs/sbom/mcop-core.cdx.json",
];

const targets = (process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : DEFAULT_TARGETS
).map((p) => (path.isAbsolute(p) ? p : path.join(repoRoot, p)));

// Map "1.6" / "1.7" / etc. to the library's Spec.Version enum entries.
function specVersionFor(value) {
  const key = `v${String(value).replace(".", "dot")}`;
  if (!(key in Spec.Version)) {
    return null;
  }
  return Spec.Version[key];
}

const validatorCache = new Map();
function validatorFor(specVersion) {
  let v = validatorCache.get(specVersion);
  if (!v) {
    v = new Validation.JsonStrictValidator(specVersion);
    validatorCache.set(specVersion, v);
  }
  return v;
}

let failures = 0;

for (const file of targets) {
  const rel = path.relative(repoRoot, file);

  // Single-step read avoids any TOCTOU race between checking existence and
  // reading the file. ENOENT is reported as a missing-target error.
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.error(`sbom:validate: missing ${rel} — run \`pnpm sbom\` first.`);
    } else {
      console.error(`sbom:validate: read failed for ${rel}: ${err.message}`);
    }
    process.exit(2);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`sbom:validate: ${rel} — JSON parse failed: ${err.message}`);
    process.exit(2);
  }

  const declared = parsed.specVersion;
  const specVersion = specVersionFor(declared);
  if (!specVersion) {
    console.error(
      `sbom:validate: ${rel} — unsupported or missing specVersion: ${JSON.stringify(declared)}`,
    );
    process.exit(2);
  }

  let errs;
  try {
    errs = await validatorFor(specVersion).validate(raw);
  } catch (err) {
    console.error(`sbom:validate: validator threw on ${rel}: ${err.message}`);
    process.exit(2);
  }

  if (errs === null) {
    console.log(`sbom:validate: ${rel} — VALID (CycloneDX ${declared})`);
  } else {
    failures += 1;
    const detail = Array.isArray(errs)
      ? errs.slice(0, 5).map((e) => `  · ${JSON.stringify(e)}`).join("\n")
      : `  · ${JSON.stringify(errs)}`;
    console.error(`sbom:validate: ${rel} — INVALID\n${detail}`);
  }
}

if (failures > 0) {
  console.error(`sbom:validate: ${failures} of ${targets.length} SBOM(s) failed schema validation.`);
  process.exit(1);
}

console.log(`sbom:validate: all ${targets.length} SBOM(s) conform to their declared CycloneDX schema.`);
