// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Minimal CODEOWNERS parser and matcher.
 *
 * Grounds the approval policy in the repo's real governance file
 * (.github/CODEOWNERS, enforced on main via require_code_owner_reviews). The
 * approved-changeset gate resolves which owners must sign off on a changeset by
 * matching its changed paths against these rules, so the machine-checkable gate
 * and the GitHub-enforced rule cannot drift apart.
 *
 * Implements the CODEOWNERS semantics this repo relies on: comments and blank
 * lines are ignored, the last matching rule wins, and patterns cover the
 * catch-all star, directory prefixes (src/), simple globs, and double-star
 * names. It is not a full gitignore engine, but it is exact for the rule shapes
 * in use and documented as such.
 */

export interface CodeownersRule {
  pattern: string;
  owners: string[];
}

export function parseCodeowners(text: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (line.length === 0) continue;
    const parts = line.split(/\s+/);
    const pattern = parts[0];
    const owners = parts.slice(1).filter((o) => o.length > 0);
    if (!pattern) continue;
    rules.push({ pattern, owners });
  }
  return rules;
}

// Regex metacharacters to escape. The star is intentionally absent so the glob
// expansion below can act on untouched stars.
const META = new Set(['.', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\']);
const STAR = String.fromCharCode(42);
const SLASH = String.fromCharCode(47);

function escapeExceptStar(s: string): string {
  let out = '';
  for (const ch of s) out += META.has(ch) ? '\\' + ch : ch;
  return out;
}

/** Anchored RegExp for a single path segment glob (stars do not cross slashes). */
function globRegExp(p: string): RegExp {
  const body = escapeExceptStar(p).split(STAR).join('[^' + SLASH + ']*');
  return new RegExp('^' + body + '$');
}

/** CODEOWNERS match: does `pattern` cover `path` (repo-relative, no leading slash)? */
function ruleMatches(pattern: string, path: string): boolean {
  if (pattern === STAR) return true; // catch-all: every file at any depth
  const anchored = pattern.startsWith(SLASH) ? pattern.slice(1) : pattern;

  if (anchored.endsWith(SLASH)) {
    // Directory prefix: the dir itself and everything under it.
    const dir = anchored.slice(0, -1);
    return path === dir || path.startsWith(dir + SLASH);
  }
  if (!anchored.includes(SLASH)) {
    // Bare name / basename glob: matches that basename at any depth.
    const base = path.slice(path.lastIndexOf(SLASH) + 1);
    return globRegExp(anchored).test(base);
  }
  // Path-anchored: exact file, or a directory prefix when used as one.
  return path === anchored || path.startsWith(anchored + SLASH) || globRegExp(anchored).test(path);
}

/** Owners for a single path: the owners of the last matching rule. */
export function ownersForPath(path: string, rules: CodeownersRule[]): string[] {
  let matched: string[] = [];
  for (const rule of rules) {
    if (ruleMatches(rule.pattern, path)) matched = rule.owners;
  }
  return matched;
}

/** Union of required owners across every changed path. */
export function requiredOwnersFor(paths: readonly string[], rules: CodeownersRule[]): string[] {
  const owners = new Set<string>();
  for (const path of paths) {
    for (const owner of ownersForPath(path, rules)) owners.add(owner);
  }
  return [...owners].sort();
}
