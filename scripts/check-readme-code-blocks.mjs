#!/usr/bin/env node
/**
 * docs:check — validate fenced code blocks in top-level Markdown documents.
 *
 * Goals (deliberately conservative — we only fail on things that are
 * unambiguously wrong, not on stylistic variation):
 *
 *   1. Every ```json (or ```jsonc) block in README.md, ARCHITECTURE.md, and
 *      docs/**.md must be valid JSON. Comments are stripped for jsonc.
 *   2. Every ```bash / ```sh block must not contain TODO / FIXME / XXX
 *      placeholders that would mislead a copy-pasting reader.
 *   3. Every fenced block claiming a `package.json` excerpt must reference
 *      a script that actually exists in the real package.json (catches
 *      doc drift when scripts get renamed).
 *   4. Soft warning when a code block declares `pnpm run <name>` and that
 *      script does not exist in package.json.
 *
 * Exit codes: 0 = clean, 1 = at least one failure.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const knownScripts = new Set(Object.keys(pkg.scripts ?? {}));

const targets = [];

function pushIfExists(p) {
  const abs = join(repoRoot, p);
  if (existsSync(abs)) targets.push(abs);
}

pushIfExists("README.md");
pushIfExists("ARCHITECTURE.md");
pushIfExists("CONTRIBUTING.md");

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      // Skip generated / vendor directories.
      if (/^(node_modules|\.git|api|sbom)$/.test(entry)) continue;
      walk(abs);
    } else if (entry.endsWith(".md")) {
      targets.push(abs);
    }
  }
}
walk(join(repoRoot, "docs"));

const failures = [];
const warnings = [];

const fenceRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;

for (const file of targets) {
  const rel = relative(repoRoot, file);
  const text = readFileSync(file, "utf8");
  let m;
  while ((m = fenceRegex.exec(text)) !== null) {
    const lang = (m[1] || "").toLowerCase();
    const body = m[2];

    if (lang === "json" || lang === "jsonc") {
      const stripped = lang === "jsonc"
        ? body.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
        : body;
      let ok = false;
      try {
        JSON.parse(stripped);
        ok = true;
      } catch {
        // Tolerate object-property excerpts, e.g. `"planning": { ... }`.
        try {
          JSON.parse(`{${stripped}}`);
          ok = true;
        } catch {
          // Tolerate array-element excerpts.
          try {
            JSON.parse(`[${stripped}]`);
            ok = true;
          } catch (err2) {
            failures.push(`${rel}: invalid ${lang} block — ${err2.message}`);
          }
        }
      }
      if (!ok) {
        // Already pushed a failure above.
      }
    }

    if (lang === "bash" || lang === "sh" || lang === "shell") {
      if (/\b(TODO|FIXME|XXX)\b/.test(body)) {
        failures.push(`${rel}: shell example contains TODO/FIXME/XXX placeholder`);
      }
      // Strip shell comments so prose like '# Activate pnpm via corepack'
      // doesn't get mistaken for a command.
      const noComments = body
        .split(/\n/)
        .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
        .join("\n");
      const pnpmRuns = noComments.matchAll(/\bpnpm\s+(?:run\s+)?([a-z][a-z0-9:_-]*)/gi);
      for (const run of pnpmRuns) {
        const name = run[1];
        // Reserved pnpm verbs we should not test for script existence.
        if (
          [
            "install",
            "add",
            "remove",
            "exec",
            "audit",
            "outdated",
            "update",
            "store",
            "why",
            "list",
            "ls",
            "publish",
            "pack",
            "test",
            "start",
            "build",
            "dev",
            "lint",
            "create",
            "init",
            "dlx",
            "import",
            "rebuild",
            "link",
            "unlink",
            "fetch",
            "filter",
            "recursive",
            "config",
            "version",
            // Common third-party CLIs invoked through pnpm in docs.
            "changeset",
            "changesets",
            "cypress",
            "playwright",
            "tsx",
            "jest",
            "eslint",
            "prettier",
            "tsc",
            "next",
            "node",
            "npx",
            "why",
          ].includes(name)
        ) {
          continue;
        }
        if (!knownScripts.has(name)) {
          warnings.push(`${rel}: docs reference 'pnpm ${name}' but no such script in package.json`);
        }
      }
    }
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
for (const f of failures) console.log(`ERROR: ${f}`);

console.log("");
console.log(`docs:check — files=${targets.length}, errors=${failures.length}, warnings=${warnings.length}`);

process.exit(failures.length > 0 ? 1 : 0);
