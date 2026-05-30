// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { ownersForPath, parseCodeowners, requiredOwnersFor } from '../conformance';

const SAMPLE = `
# comment line
*                                @owner
src/                             @owner
next.config.*                    @owner
**/Dockerfile                    @owner
packages/core/package.json       @sec
.github/workflows/               @ci
`;

describe('CODEOWNERS parser + matcher', () => {
  const rules = parseCodeowners(SAMPLE);

  it('ignores comments and blank lines', () => {
    expect(rules).toHaveLength(6);
    expect(rules[0]).toEqual({ pattern: '*', owners: ['@owner'] });
  });

  it('catch-all star matches files at any depth', () => {
    expect(ownersForPath('README.md', rules)).toEqual(['@owner']);
    expect(ownersForPath('a/b/c/deep.txt', rules)).toEqual(['@owner']);
  });

  it('last matching rule wins', () => {
    // packages/core/package.json matches both `*` and the explicit rule.
    expect(ownersForPath('packages/core/package.json', rules)).toEqual(['@sec']);
    // a workflow file is owned by @ci via the directory prefix.
    expect(ownersForPath('.github/workflows/ci.yml', rules)).toEqual(['@ci']);
  });

  it('directory prefixes match the dir and everything under it', () => {
    expect(ownersForPath('src/core/x.ts', rules)).toEqual(['@owner']);
  });

  it('basename globs match at any depth', () => {
    expect(ownersForPath('services/api/Dockerfile', rules)).toEqual(['@owner']);
    expect(ownersForPath('next.config.ts', rules)).toEqual(['@owner']);
  });

  it('unions required owners across changed paths', () => {
    const owners = requiredOwnersFor(['src/x.ts', 'packages/core/package.json'], rules);
    expect(owners).toEqual(['@owner', '@sec']);
  });

  it('matches the real repo CODEOWNERS catch-all to @Kuonirad', () => {
    // Sanity check against the live governance file shape used by the gate.
    const live = parseCodeowners('*                                @Kuonirad\nsrc/                             @Kuonirad\n');
    expect(requiredOwnersFor(['src/conformance/index.ts', 'docs/anything.md'], live)).toEqual(['@Kuonirad']);
  });
});
