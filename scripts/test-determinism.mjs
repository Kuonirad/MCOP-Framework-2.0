#!/usr/bin/env node
/**
 * determinism:test — proof that the audit-relevant primitives are
 * bit-for-bit reproducible across repeated invocations within the same
 * Node process and across cold sub-process invocations.
 *
 * We deliberately avoid importing the @kullailabs/mcop-core build artifact
 * here so this gate runs *without* a prior `pnpm build`. Instead we exercise
 * the deterministic primitives the harness's claims actually depend on:
 *
 *   - JSON canonicalization (RFC 8785 / JCS) via the `canonicalize` package
 *     that the framework declares as a runtime dependency.
 *   - SHA-256 hashing of the canonical form.
 *
 * If either is non-deterministic across invocations, the audit's
 * provenance/Merkle claims are invalid by definition.
 *
 * Exit codes: 0 = deterministic, 1 = drift detected.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAMPLES = [
  { kind: "scalar", value: 1 },
  { kind: "string", value: "ψ" },
  { kind: "object", a: 1, b: [3, 2, 1], c: { z: null, y: false, x: "x" } },
  { kind: "deep", arr: Array.from({ length: 64 }, (_, i) => ({ i, t: i / 7 })) },
];

let canonicalize;
try {
  ({ default: canonicalize } = await import("canonicalize"));
} catch (err) {
  console.error("ERROR: cannot resolve 'canonicalize' module — run pnpm install first.");
  console.error(err.message);
  process.exit(1);
}

function fingerprint(obj) {
  const canonical = canonicalize(obj);
  const hash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return { canonical, hash };
}

const ITERATIONS = 64;
const inProcess = SAMPLES.map((sample) => {
  const fps = Array.from({ length: ITERATIONS }, () => fingerprint(sample));
  const first = fps[0].hash;
  const drift = fps.find((fp) => fp.hash !== first);
  return { sample: sample.kind, hash: first, drift: drift ? drift.hash : null };
});

let failures = 0;
for (const r of inProcess) {
  if (r.drift) {
    console.log(`ERROR: in-process drift for sample '${r.sample}': ${r.hash} != ${r.drift}`);
    failures++;
  } else {
    console.log(`PASS: in-process determinism for '${r.sample}' — sha256=${r.hash.slice(0, 12)}…`);
  }
}

// Cold-process determinism: spawn this same script in a child and compare.
if (!process.env.MCOP_DETERMINISM_CHILD) {
  const child = spawnSync(process.execPath, [__filename], {
    encoding: "utf8",
    env: { ...process.env, MCOP_DETERMINISM_CHILD: "1" },
  });
  if (child.status !== 0) {
    console.log("ERROR: child invocation failed — cannot validate cold-start determinism");
    console.log(child.stderr);
    failures++;
  } else {
    const childHashes = [...child.stdout.matchAll(/PASS: in-process determinism for '(\w+)' — sha256=([0-9a-f]+)/g)]
      .map(([, k, h]) => [k, h]);
    for (const r of inProcess) {
      const ch = childHashes.find(([k]) => k === r.sample);
      if (!ch) {
        console.log(`ERROR: child did not report sample '${r.sample}'`);
        failures++;
      } else if (!r.hash.startsWith(ch[1].replace("…", ""))) {
        console.log(`ERROR: cold-start drift for '${r.sample}': parent=${r.hash.slice(0, 12)} child=${ch[1]}`);
        failures++;
      } else {
        console.log(`PASS: cold-start determinism for '${r.sample}'`);
      }
    }
  }
}

console.log("");
console.log(`determinism:test — samples=${SAMPLES.length}, iterations=${ITERATIONS}, failures=${failures}`);
process.exit(failures > 0 ? 1 : 0);
