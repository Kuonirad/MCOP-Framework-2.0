# NOTICE — Licensing

The KullAILABS MCOP Framework 2.0 is licensed under the
**Apache License 2.0** (Apache-2.0). The full text is in the top-level
[`LICENSE`](./LICENSE) file.

Copyright © 2025-2026 Kevin John Kull (GitHub: [@Kuonirad](https://github.com/Kuonirad))
and the KullAILABS MCOP Framework contributors.

## License history

The project's license has changed over time. The current license
(Apache-2.0) applies to all current and future commits, releases, and
distributions.

| Period | License |
|---|---|
| Original release | MIT |
| 2026-04-26 → 2026-05-26 | Business Source License 1.1 (source-available) |
| 2026-05-26 onward | **Apache License 2.0** (open source) |

The relicensing **broadens** the rights granted — Apache-2.0 is an
OSI-approved open-source license, so this move only adds permissions
relative to the prior source-available BUSL 1.1 terms. As the sole
copyright holder, the Licensor (Kevin John Kull) has the right to
issue these terms; relicensing does not retroactively withdraw any
grant already made under an earlier license.

- **Versions originally distributed under MIT** remain available under
  the MIT License for those versions. The MIT text is preserved in
  [`LICENSE-MIT-LEGACY`](./LICENSE-MIT-LEGACY).
- **Versions distributed under BUSL 1.1** (commits/tags between
  2026-04-26 and the Apache-2.0 relicense) were source-available under
  those terms; the current tree supersedes them with the more
  permissive Apache-2.0 grant.

## What Apache 2.0 means in practice

Apache-2.0 is a permissive open-source license. You may use, copy,
modify, distribute, and sublicense the Licensed Work — including for
commercial and production use — subject to its terms, which include:

- **Attribution**: retain the copyright, license, and any `NOTICE`
  text when you redistribute.
- **State changes**: mark files you modify as changed.
- **Patent grant**: contributors grant an express patent license; that
  grant terminates for anyone who initiates patent litigation alleging
  the Work infringes.
- **No trademark grant**: the license does not grant rights to the
  Licensor's names, logos, or trademarks.
- **As-is**: the Work is provided without warranty.

## Ecosystem integration shims

The framework-agnostic integration shims in
`src/integrations/{langchain,llamaIndex,haystack}.ts` and
`mcop_package/mcop/integrations/{langchain,llamaindex,haystack}.py`
are licensed under the **MIT License** (see
[`LICENSE-MIT-INTEGRATIONS`](./LICENSE-MIT-INTEGRATIONS)) so they
remain trivially vendorable into uniformly MIT-licensed upstream agent
frameworks. Each carries an `SPDX-License-Identifier: MIT` header.
Apache-2.0 governs every other file in the repository.

## Contributor attribution

Contributions are accepted under the project's current license. The
copyright in each contribution remains with its author; contributors
license their work under Apache-2.0 (and certify their contributions
via the Developer Certificate of Origin (DCO) as described in
[`CONTRIBUTING.md`](./CONTRIBUTING.md)). Contributions made under
earlier licenses remain available under those licenses in the git
history.

## Contact

For questions about licensing or alternative arrangements, contact:

- Email: kevinkull.kk@gmail.com
- GitHub: [@Kuonirad](https://github.com/Kuonirad)
