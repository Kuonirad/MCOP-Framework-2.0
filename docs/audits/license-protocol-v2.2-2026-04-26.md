# Licensing Audit Protocol v2.2 — Run Log

| Field | Value |
|---|---|
| Protocol version | v2.2 |
| Execution track | Defense-in-Depth (all 8 steps) |
| Audit timestamp (UTC) | `2026-04-26T06:13:45Z` |
| Repository HEAD | `871ddfb963ea29902fed2ccf1243f01a38a494e2` |
| Anchor commit (BUSL Change-Date pin) | `66438ea3fc57f4af80d4e9d38f769a4e65d7839b` |
| Verdict | **PASS** — zero blocking findings |

---

## Step 1 — Forensic Repository Verification

- HEAD SHA: `871ddfb963ea29902fed2ccf1243f01a38a494e2`
- UTC: `2026-04-26T06:13:45Z`
- Compared against prior relicense anchor `66438ea3` — three subsequent
  remediation PRs (#490, #491, #492) merged cleanly to `main`.
- AUG provenance via `git log -S "Additional Use Grant" -- LICENSE`:

  ```
  871ddfb chore(license): tighten AUG, fix llms.txt license, add audit + guard workflow (#492)
  e530b07 fix(license): remediate BSL 1.1 Covenant 2 grant framing + pin Change… (#491)
  f436e1d feat(license): relicense to BUSL 1.1 going forward (Change Date 2030-04-26 → MIT) (#482)
  ```

  Lineage is monotonic: introduced in `f436e1d`, tightened in `e530b07`,
  finalised in `871ddfb`. No spurious AUG edits outside these three PRs.

## Step 2 — Authoritative 8-Artifact Comparison

| Artifact | State |
|---|---|
| `/LICENSE` | BUSL 1.1, AUG present, anchored to `66438ea3`, Change Date `2030-04-26T00:00:00Z`, Change License MIT |
| `/packages/core/LICENSE` | byte-identical to root `/LICENSE` (`cmp -s` passes) |
| `/mcop_package/LICENSE` | byte-identical to root `/LICENSE` (`cmp -s` passes) |
| `/NOTICE.md` | describes MIT→BUSL transition, pins anchor commit + Change Date, enumerates Prohibited Use Cases |
| `/LICENSE-MIT-LEGACY` | preserves original MIT grant verbatim with explanatory header |
| `/package.json` | `"license": "BUSL-1.1"` |
| `/packages/core/package.json` | `"license": "BUSL-1.1"`, `files[]` includes `"LICENSE"` |
| `/CONTRIBUTING.md` | full Linux-style DCO 1.1 + `Signed-off-by` requirement |
| `/README.md` | names BUSL 1.1, links both `LICENSE-MIT-LEGACY` and `NOTICE.md` |

**Blame check on `LICENSE` line 23:** reads `the Change License takes effect on the earlier of` — there is **no residual `NOTICE.md` reference inside the BUSL grant block**. Covenant 2 is preserved (no extra restrictions injected into the licence text).

## Step 3 — Publication-Surface Modeling

- `packages/core/package.json` → `"files": ["dist", "src", "README.md", "LICENSE"]` ✓
- No `.npmignore` at repo root or in `packages/core/` (no risk of silent exclusion).
- Repo-wide search `files.*LICENSE`: only the intended hit in `packages/core/package.json`.

## Step 4 — Repo-Wide Conflict & Residual Scan

| Search | Result |
|---|---|
| `you may NOT` | Hits only in `NOTICE.md` (Prohibited Use Cases). **Zero** in `LICENSE`/`LICENSE-MIT-LEGACY`/`packages/core/LICENSE`/`mcop_package/LICENSE`. |
| `MIT` | Expected legacy/transition mentions only (`LICENSE-MIT-LEGACY`, `NOTICE.md`, `README.md` legacy paragraph). |
| `BUSL` / `Business Source License 1.1` | Present in all four `LICENSE*` files, both `package.json`s, `NOTICE.md`, `README.md`, `public/llms.txt`. |
| `Additional Use Grant` | Present only inside the three `LICENSE` mirrors (root, `packages/core/`, `mcop_package/`) and once each in `NOTICE.md`, `mcop_package/README.md`, `mcop_package/USAGE_GUIDE.md` — all explanatory, no contradictory grants. |
| `SPDX-License-Identifier` | **Zero hits** across `*.ts`/`*.tsx`/`*.js`/`*.mjs`/`*.py`. Captured as non-blocking hygiene item below. |

## Step 5 — Contributor Chain-of-Title & Governance

- `CONTRIBUTING.md` §"Licensing and Contributions" carries the verbatim
  Developer Certificate of Origin 1.1 plus the `Signed-off-by:` requirement
  and the `git commit -s` instruction.
- `git log` confirms pre-2026-04-25 commits (`88b0b65` and earlier) lived
  under MIT; BUSL takes effect from PR #482 (`f436e1d`) onward. The
  Change-Date anchor commit `66438ea3` predates the LICENSE-file commit
  by design — it marks the publication boundary referenced in the BUSL
  parameter block.
- **v2.2 enhancement (this PR):** `CONTRIBUTING.md` is being amended to add a
  one-sentence CLA clause naming Kevin John Kull as sole relicensor for the
  2030 MIT transition.

## Step 6 — README / Documentation Sync

- `README.md` line 6 — `[![License: BUSL 1.1](...)](LICENSE)` badge.
- `README.md` line 175–183 — license summary names BUSL 1.1, the Change
  Date, the AUG scope, and links both `LICENSE-MIT-LEGACY` and `NOTICE.md`.
- `public/llms.txt` declares `License: BUSL-1.1 (Business Source License 1.1, MIT on Change Date 2030-04-26)` — no stale MIT advertisement.
- **v2.2 enhancement (this PR):** `CONTRIBUTING.md` gains an `## SPDX headers`
  subsection documenting the canonical header for **new** TS/JS/MJS and
  Python source files. A repo-wide backfill is intentionally deferred (out
  of scope; would fight `--max-warnings 0` lint gates).

## Step 7 — Automated Self-Verification Script

`scripts/license-audit.sh` exists and is more rigorous than the protocol's
inline draft (uses `set -euo pipefail`, repo-root resolution, `pass`/`fail`/
`require_grep`/`require_not_grep` helpers, byte-identity `cmp -s` checks for
the LICENSE mirrors, and a guard against `public/llms.txt` regressing to
`- License: MIT`).

Captured run on the audited HEAD (`871ddfb`):

```
==> license-audit: required artefacts
  ✓ exists: LICENSE
  ✓ exists: LICENSE-MIT-LEGACY
  ✓ exists: NOTICE.md
  ✓ exists: CONTRIBUTING.md
  ✓ exists: README.md
  ✓ exists: packages/core/LICENSE
  ✓ exists: packages/core/package.json
  ✓ exists: mcop_package/LICENSE
  ✓ exists: package.json
  ✓ exists: public/llms.txt
==> license-audit: root LICENSE content
  ✓ LICENSE names BUSL 1.1
  ✓ LICENSE includes Additional Use Grant block
  ✓ LICENSE pins Change Date 2030-04-26T00:00:00Z
  ✓ LICENSE pins anchor commit
  ✓ LICENSE names MIT as Change License
  ✓ LICENSE does not contain restrictive 'you may NOT' phrasing
==> license-audit: mirrored LICENSE files match root
  ✓ packages/core/LICENSE matches root LICENSE byte-for-byte
  ✓ mcop_package/LICENSE matches root LICENSE byte-for-byte
==> license-audit: package metadata declares BUSL-1.1
  ✓ root package.json declares BUSL-1.1
  ✓ packages/core/package.json declares BUSL-1.1
  ✓ packages/core/package.json files[] includes LICENSE
==> license-audit: NOTICE.md content
  ✓ NOTICE.md describes the license transition
  ✓ NOTICE.md pins anchor commit
  ✓ NOTICE.md pins Change Date
  ✓ NOTICE.md enumerates Prohibited Use Cases
==> license-audit: CONTRIBUTING.md DCO
  ✓ CONTRIBUTING.md references DCO
  ✓ CONTRIBUTING.md requires Signed-off-by
==> license-audit: README.md license markers
  ✓ README.md names BUSL 1.1
  ✓ README.md links LICENSE-MIT-LEGACY
  ✓ README.md links NOTICE.md
==> license-audit: public/llms.txt does not advertise stale MIT
  ✓ public/llms.txt does not advertise stale MIT

license-audit: OK
```

Exit code: `0`.

## Step 8 — Risk Judgment & Permanent Monitoring

```
Critical/Blocking:    none
Non-blocking hygiene: (1) No SPDX-License-Identifier headers in source files
                      (2) CONTRIBUTING.md has DCO but no optional one-line CLA
                          clause naming Kevin John Kull as sole relicensor
                      (3) License Guard workflow gates on failure but does not
                          post the audit transcript as a PR comment
                      (4) No `license-protocol-v2.2` tag yet
Uncertainty limits:   Static only (no runtime SBOM check, no dependency-license
                      scan; both out of scope for this protocol)
Exact remediation:    (1) Document SPDX header in CONTRIBUTING.md + soft-warn
                          for newly-added source files in license-audit.sh
                          (full backfill deferred — too large a flag day)
                      (2) Append one-sentence CLA clause to CONTRIBUTING.md
                          §"Licensing and Contributions"
                      (3) Add `actions/github-script`-based PR-comment step
                          to .github/workflows/license-guard.yml; widen
                          permissions to include `pull-requests: write`
                      (4) Tag the merge commit of this PR as
                          `license-protocol-v2.2`
```

`License Guard` workflow at `.github/workflows/license-guard.yml` already
triggers on push to `main`, on PR, and on `workflow_dispatch`, with the
correct path filters and a SHA-pinned `actions/checkout`. This PR widens
its responsibilities to also post the audit transcript as a PR comment so
reviewers see the verdict inline.

## Provenance footer

- Audit executed by: Claude Code on branch `claude/licensing-audit-protocol-n4qjk`
- Audit script SHA-256 (at `871ddfb`): captured implicitly via the LICENSE-Guard workflow run on this PR.
- Next audit due: after any further LICENSE/NOTICE touch.
