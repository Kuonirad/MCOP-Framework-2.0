import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const validBody = `# Pull Request

## 🚀 Type of Change
- [x] 📚 Documentation update

## 📊 Checklist
- [x] ✅ My code follows the style guidelines of this project
- [x] ✅ I have performed a self-review of my own code
- [x] ✅ I have commented my code, particularly in hard-to-understand areas
- [x] ✅ I have made corresponding changes to the documentation
- [x] ✅ My changes generate no new warnings
- [x] ✅ I have added tests that prove my fix is effective or that my feature works
- [x] ✅ New and existing unit tests pass locally with my changes
- [ ] ✅ Any dependent changes have been merged and published

## 🧪 Testing
- [x] Unit tests

## 📊 MCOP Framework Metrics

**Entropy Impact**:
- [ ] 🔴 High (>0.15)
- [ ] 🟡 Medium (0.07-0.15)
- [x] 🟢 Low (<0.07)

**Confidence Level**:
- [ ] 🔴 Low (<0.8)
- [ ] 🟡 Medium (0.8-0.95)
- [x] 🟢 High (>0.95)

**Performance Impact**:
- [ ] 🔴 Degradation
- [x] 🟡 Neutral
- [ ] 🟢 Improvement
`;

const validBodyWithHeadingMetrics = validBody
  .replace('**Entropy Impact**:', '### Entropy Impact')
  .replace('**Confidence Level**:', '### Confidence Level')
  .replace('**Performance Impact**:', '### Performance Impact');

describe('audit remediation guardrail scripts', () => {
  it('rejects empty PR checklists so unchecked templates cannot merge silently', () => {
    const result = spawnSync('node', ['scripts/verify-pr-checklist.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PR_BODY: '## 📊 Checklist\n- [ ] unchecked', CHANGED_FILES: 'src/index.ts' },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Select at least one Type of Change checkbox');
    expect(result.stderr).toContain('Select at least one Testing checkbox');
  });

  it('accepts a completed PR checklist with exactly one metrics selection per axis', () => {
    execFileSync('node', ['scripts/verify-pr-checklist.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PR_BODY: validBody, CHANGED_FILES: 'src/index.ts' },
      encoding: 'utf8',
    });
  });

  it('accepts checklist metrics written as markdown headings', () => {
    execFileSync('node', ['scripts/verify-pr-checklist.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, PR_BODY: validBodyWithHeadingMetrics, CHANGED_FILES: 'src/index.ts' },
      encoding: 'utf8',
    });
  });

  it('accepts tracked Python automation under scripts while ignoring generated caches', () => {
    execFileSync('node', ['scripts/placement-linter.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  });

  it('keeps positive-audit artifact reads free of existence-check TOCTOU patterns', () => {
    const source = readFileSync('scripts/positive-audit.mjs', 'utf8');

    expect(source).not.toMatch(/existsSync\((?:ledgerPath|reportPath|signalsPath)\)/);
    expect(source).toContain('function readOptionalFile');
  });

  it('treats LF and CRLF shared documents as the same content', () => {
    const result = execFileSync(
      'node',
      [
        '--input-type=module',
        '--eval',
        "import { sha256OfText } from './scripts/shared-docs-guard.mjs'; process.stdout.write(String(sha256OfText('one\\ntwo\\n') === sha256OfText('one\\r\\ntwo\\r\\n')));",
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result).toBe('true');
  });

  it('routes positive-audit checks through the configured Windows shell', () => {
    const result = execFileSync(
      'node',
      [
        '--input-type=module',
        '--eval',
        "import { buildCheckInvocation } from './scripts/positive-audit.mjs'; const invocation = buildCheckInvocation('pnpm', ['lint'], { platform: 'win32', env: { ComSpec: 'cmd.exe' } }); process.stdout.write(JSON.stringify(invocation));",
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(JSON.parse(result)).toEqual([
      'cmd.exe',
      ['/d', '/s', '/c', 'pnpm', 'lint'],
    ]);
  });

  it('keeps README shields.io metric endpoints cache-busted and encoded', () => {
    const source = readFileSync('README.md', 'utf8');
    const endpointBadges = source.match(/https:\/\/img\.shields\.io\/endpoint\?cacheSeconds=300&style=flat-square&url=https%3A%2F%2Fraw\.githubusercontent\.com%2FKuonirad%2FMCOP-Framework-2\.0%2Fmain%2F\.github%2Fmetrics%2Fpositive-[^)]+\.json/g) ?? [];

    expect(source).not.toContain('https://img.shields.io/endpoint?url=https://raw.githubusercontent.com');
    expect(endpointBadges).toHaveLength(4);
  });

  it('keeps the coverage badge internally consistent with README coverage claims', () => {
    const badge = readFileSync('docs/badges/coverage.svg', 'utf8');
    const readme = readFileSync('README.md', 'utf8');
    const ariaPct = badge.match(/aria-label="coverage: ([0-9.]+%)"/)?.[1];
    const titlePct = badge.match(/<title>coverage: ([0-9.]+%)<\/title>/)?.[1];
    const visibleValues = Array.from(badge.matchAll(/>([0-9.]+%)<\/text>/g), (match) => match[1]);

    expect(ariaPct).toBeDefined();
    expect(titlePct).toBe(ariaPct);
    expect(new Set(visibleValues)).toEqual(new Set([ariaPct]));
    expect(readme).toContain(`**${ariaPct}** test coverage`);
    expect(readme).toContain(`**${ariaPct}** | varies | varies | varies`);
    expect(readme).toContain(`Jest suite — ${ariaPct} covered`);
  });

  it('keeps the positive-impact measurement loop promoted in the README hero', () => {
    const source = readFileSync('README.md', 'utf8');
    const hero = source.slice(0, source.indexOf('## ◆ What is MCOP?'));

    expect(hero).toContain('## ◆ Live Positive Impact Proof ◆');
    expect(hero).toContain('This repo measures its own positive impact via MCOP primitives — [100% current score, machine-verifiable](./docs/POSITIVE_IMPACT_REPORT.md).');
    expect(hero).toContain('[`pnpm positive:audit`](./docs/POSITIVE_IMPACT_REPORT.md)');
    expect(hero).toContain('[holographic-etch ledger](./audit/positive-resonance-ledger.md)');
  });

  it('rejects unpinned actions and obsolete Node runtimes in workflow fixtures', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcop-workflow-hygiene-'));
    const workflow = join(dir, 'bad.yml');
    writeFileSync(workflow, `name: bad\njobs:\n  bad:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: cypress-io/github-action@c495c3ddffba403ba11be95fffb67e25203b3799\n      - run: echo ok\n        with:\n          node-version: '20'\n`);

    const result = spawnSync('node', ['scripts/verify-workflow-hygiene.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env },
      encoding: 'utf8',
      input: '',
    });

    expect(result.status).toBe(0);

    const fixtureResult = spawnSync(
      'node',
      [
        '-e',
        "import('./scripts/verify-workflow-hygiene.mjs').then(({verifyWorkflowHygiene}) => { const workflowPath = process.env.WORKFLOW_PATH; const r = verifyWorkflowHygiene([workflowPath]); if (r.ok) process.exit(2); console.error(r.errors.join('\\n')); })",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, WORKFLOW_PATH: workflow },
        encoding: 'utf8',
      },
    );
    expect(fixtureResult.status).toBe(0);
    expect(fixtureResult.stderr).toContain('actions/checkout@v4');
    expect(fixtureResult.stderr).toContain('minimum CI runtime is Node 22.x');
  });
});
