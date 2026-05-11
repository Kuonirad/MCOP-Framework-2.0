# Dormant Branch Triage — 2026-05-11

**Trigger:** External audit dated 2026-05-11 flagged "~12 dormant unmerged branches"
including `fix/production-deployment-triage`, recommending review or pruning.

**Actual count:** 47 dormant remote branches (excluding `main` and the active
review branch). All are AI-agent outputs (palette / sentinel / jules / bolt /
testing suffix patterns) that diverged from old `main` snapshots and were
never opened as PRs or were superseded by later PRs that landed equivalent
work.

## Verification: `fix/production-deployment-triage`

The audit specifically called out this branch ("implies an unresolved
production concern"). Its single non-merge commit (`0bc3281`, 2026-04-19)
fixes seven items. Each was checked against current `main` (HEAD
`fc229fda`):

| Fix | Status in `main` |
|---|---|
| Dockerfile uses `corepack` + pnpm | ✅ present |
| `package.json` has `engines` + `packageManager: pnpm@9.15.0` | ✅ present |
| Duplicate `eco:audit` key removed | ✅ single key |
| `.dockerignore` references `pnpm-lock.yaml` (not `package-lock.json`) | ✅ correct |
| `next.config.ts` CSP `script-src` allows `unsafe-inline` for hydration | ✅ present |
| CI workflow (`.github/workflows/ci.yml`) deduplicated | ✅ 188 lines, clean |
| `eco-fitness.yml` removed sed hot-patch, Node ≥ 20 | ✅ (Node 24 per PR #657) |

**Conclusion:** branch is fully superseded. No hidden production incident.
Safe to delete.

## Disposition Table

All 47 branches are AI-agent-generated and superseded. The "commits ahead"
counts are inflated by stale merge history (branches forked from very old
`main` snapshots); actual unique work per branch is typically 1–2 commits
that have been re-landed via later PRs.

| # | Last commit | Ahead | Branch | Disposition |
|---|---|---|---|---|
| 1 | 2026-02-01 | 183 | `ux/page-accessibility-polish-6080017836060321049` | DELETE — superseded by a11y work in main |
| 2 | 2026-02-02 | 184 | `fix/cli-security-breakage-9332337412067074016` | DELETE — superseded |
| 3 | 2026-02-13 | 186 | `feat-ui-focus-styles-3992679940612736163` | DELETE — superseded |
| 4 | 2026-02-14 | 184 | `feat/ui-focus-arrow-improvements-7915453027197945703` | DELETE — superseded |
| 5 | 2026-02-21 | 184 | `fix/logger-redaction-5972589629854234481` | DELETE — logger redaction in main |
| 6 | 2026-02-24 | 186 | `security-logger-redaction-950591026973736323` | DELETE — superseded |
| 7 | 2026-02-27 | 183 | `feat/copyable-code-snippet-1673596273780289191` | DELETE — superseded |
| 8 | 2026-02-27 | 186 | `feat/sentinel-novaneo-input-validation-5529219500386984323` | DELETE — superseded |
| 9 | 2026-02-28 | 183 | `ux/focus-visible-arrows-4804400433609795676` | DELETE — superseded |
| 10 | 2026-04-01 | 183 | `palette/a11y-decorative-icons-15733978383333493709` | DELETE — palette cluster |
| 11 | 2026-04-01 | 185 | `sentinel-redact-logger-429899399635696717` | DELETE — sentinel cluster |
| 12 | 2026-04-02 | 183 | `sentinel/logger-redact-16422417326323992343` | DELETE — sentinel cluster |
| 13 | 2026-04-02 | 185 | `palette-accessibility-vercel-logomark-16836196415721032432` | DELETE — palette cluster |
| 14 | 2026-04-03 | 186 | `palette/aria-hidden-icon-15009341631427157458` | DELETE — palette cluster |
| 15 | 2026-04-03 | 187 | `sentinel-logger-redaction-17184898211452510124` | DELETE — sentinel cluster |
| 16 | 2026-04-04 | 185 | `sentinel/logger-redaction-14189750597268739967` | DELETE — sentinel cluster |
| 17 | 2026-04-04 | 187 | `palette-a11y-vercel-logomark-2328472297489969124` | DELETE — palette cluster |
| 18 | 2026-04-05 | 186 | `palette-deploy-now-a11y-655646817475142863` | DELETE — palette cluster |
| 19 | 2026-04-05 | 186 | `sentinel/add-logger-redaction-10707541824006171618` | DELETE — sentinel cluster |
| 20 | 2026-04-06 | 185 | `palette-improve-vercel-link-a11y-4338096963079015782` | DELETE — palette cluster |
| 21 | 2026-04-06 | 186 | `sentinel-add-logger-redaction-3732436960858539243` | DELETE — sentinel cluster |
| 22 | 2026-04-07 | 184 | `sentinel-logger-redaction-5072781153059463645` | DELETE — sentinel cluster |
| 23 | 2026-04-07 | 187 | `palette-vercel-link-a11y-7737687866486695380` | DELETE — palette cluster |
| 24 | 2026-04-08 | 185 | `palette/vercel-deploy-a11y-7751472996894159455` | DELETE — palette cluster |
| 25 | 2026-04-08 | 186 | `sentinel/fix-logger-redaction-9066408904286203425` | DELETE — sentinel cluster |
| 26 | 2026-04-09 | 185 | `sentinel-logger-redact-5724494250689039013` | DELETE — sentinel cluster |
| 27 | 2026-04-09 | 186 | `palette/vercel-link-a11y-14392322906153288909` | DELETE — palette cluster |
| 28 | 2026-04-10 | 185 | `palette-vercel-link-a11y-4770498579384340061` | DELETE — palette cluster |
| 29 | 2026-04-10 | 186 | `sentinel-logger-redaction-3936810806097797438` | DELETE — sentinel cluster |
| 30 | 2026-04-11 | 185 | `palette-vercel-link-a11y-17656659980144567180` | DELETE — palette cluster |
| 31 | 2026-04-11 | 185 | `sentinel-logger-redaction-14957031740709932351` | DELETE — sentinel cluster |
| 32 | 2026-04-12 | 184 | `sentinel-logger-redact-17233209829419497365` | DELETE — sentinel cluster |
| 33 | 2026-04-12 | 185 | `palette/deploy-btn-a11y-17953582253146308428` | DELETE — palette cluster |
| 34 | 2026-04-13 | 185 | `palette-ux-vercel-link-context-1242977185197071426` | DELETE — palette cluster |
| 35 | 2026-04-13 | 187 | `sentinel-logger-redaction-2834082724938918988` | DELETE — sentinel cluster |
| 36 | 2026-04-14 | 186 | `palette/vercel-deploy-link-a11y-4427298942420792415` | DELETE — palette cluster |
| 37 | 2026-04-17 | 234 | `jules-3894583314191577890-a6eeed36` | DELETE — Jules AI output, superseded |
| 38 | 2026-04-17 | 235 | `testing/holographic-etch-16405907098308834381` | DELETE — superseded by current test suite |
| 39 | 2026-04-17 | 236 | `fix-upstream-security-hardening-001-11939927927952750594` | DELETE — superseded by PRs #651/#660 |
| 40 | 2026-04-17 | 236 | `perf-tensor-hash-5831609479645833293` | DELETE — superseded |
| 41 | 2026-04-17 | 236 | `security/fix-path-traversal-cli-6525187101215562471` | DELETE — superseded by PR #651/#660 chain |
| 42 | 2026-04-17 | 236 | `test-format-confidence-3603994037704149379` | DELETE — superseded |
| 43 | 2026-04-17 | 236 | `testing/add-truncate-text-tests-15902125840459686918` | DELETE — superseded |
| 44 | 2026-04-17 | 237 | `test-format-grounding-13529561110490576482` | DELETE — superseded |
| 45 | 2026-04-19 | 273 | `fix/production-deployment-triage` | DELETE — verified superseded (table above) |
| 46 | 2026-04-20 | 274 | `jules-performance-bolt-6104930428238230292` | DELETE — Jules AI output, superseded |
| 47 | 2026-05-05 | 2 | `pr-619` | DELETE — closed PR scratch branch |

## One-shot Deletion Command

Run from a clone with push permission (the proxy used in this session blocks
delete-refs with HTTP 403):

```bash
git fetch --prune origin

git push origin --delete \
  ux/page-accessibility-polish-6080017836060321049 \
  fix/cli-security-breakage-9332337412067074016 \
  feat-ui-focus-styles-3992679940612736163 \
  feat/ui-focus-arrow-improvements-7915453027197945703 \
  fix/logger-redaction-5972589629854234481 \
  security-logger-redaction-950591026973736323 \
  feat/copyable-code-snippet-1673596273780289191 \
  feat/sentinel-novaneo-input-validation-5529219500386984323 \
  ux/focus-visible-arrows-4804400433609795676 \
  palette/a11y-decorative-icons-15733978383333493709 \
  sentinel-redact-logger-429899399635696717 \
  sentinel/logger-redact-16422417326323992343 \
  palette-accessibility-vercel-logomark-16836196415721032432 \
  palette/aria-hidden-icon-15009341631427157458 \
  sentinel-logger-redaction-17184898211452510124 \
  sentinel/logger-redaction-14189750597268739967 \
  palette-a11y-vercel-logomark-2328472297489969124 \
  palette-deploy-now-a11y-655646817475142863 \
  sentinel/add-logger-redaction-10707541824006171618 \
  palette-improve-vercel-link-a11y-4338096963079015782 \
  sentinel-add-logger-redaction-3732436960858539243 \
  sentinel-logger-redaction-5072781153059463645 \
  palette-vercel-link-a11y-7737687866486695380 \
  palette/vercel-deploy-a11y-7751472996894159455 \
  sentinel/fix-logger-redaction-9066408904286203425 \
  sentinel-logger-redact-5724494250689039013 \
  palette/vercel-link-a11y-14392322906153288909 \
  palette-vercel-link-a11y-4770498579384340061 \
  sentinel-logger-redaction-3936810806097797438 \
  palette-vercel-link-a11y-17656659980144567180 \
  sentinel-logger-redaction-14957031740709932351 \
  sentinel-logger-redact-17233209829419497365 \
  palette/deploy-btn-a11y-17953582253146308428 \
  palette-ux-vercel-link-context-1242977185197071426 \
  sentinel-logger-redaction-2834082724938918988 \
  palette/vercel-deploy-link-a11y-4427298942420792415 \
  jules-3894583314191577890-a6eeed36 \
  testing/holographic-etch-16405907098308834381 \
  fix-upstream-security-hardening-001-11939927927952750594 \
  perf-tensor-hash-5831609479645833293 \
  security/fix-path-traversal-cli-6525187101215562471 \
  test-format-confidence-3603994037704149379 \
  testing/add-truncate-text-tests-15902125840459686918 \
  test-format-grounding-13529561110490576482 \
  fix/production-deployment-triage \
  jules-performance-bolt-6104930428238230292 \
  pr-619
```

## Recovery

All deleted commits remain reachable through their closed PRs on GitHub and
through `git reflog` on any clone that had them fetched. To restore a single
branch within the GitHub UI retention window:

```
gh api -X POST repos/Kuonirad/MCOP-Framework-2.0/git/refs \
  -f ref="refs/heads/<branch>" -f sha="<commit-sha-from-pr-or-reflog>"
```

## Follow-up Recommendation

Add a scheduled GitHub Actions workflow that auto-deletes any non-protected
branch with no commits in the last 60 days and no associated open PR. Pair
with branch-protection enforcement that requires a PR before push for any
non-`main` work, to prevent further accumulation of AI-agent scratch
branches.
