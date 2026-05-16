# Security Policy

## Supported Versions

| Version | Supported          |
|--------:|:------------------:|
| 2.3.x   | :white_check_mark: |
| 2.2.x   | :white_check_mark: |
| 2.1.x   | :x: (please upgrade) |
| 2.0.x   | :x: (please upgrade) |
| 1.0.x   | :x: (please upgrade) |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We are committed to the security of this framework and take all security vulnerabilities seriously.

### DO NOT Report Security Vulnerabilities Through Public GitHub Issues

Report privately via GitHub's [Private Vulnerability Reporting](https://github.com/Kuonirad/MCOP-Framework-2.0/security/advisories/new)
(Security → Report a vulnerability). This creates a private advisory visible
only to maintainers and the reporter, and supports collaborator invites and
CVE issuance when appropriate.

### What to Include in Your Report

- Type of vulnerability (e.g., XSS, SQL injection, buffer overflow)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability, including how an attacker might exploit it

### PGP Encryption (Optional)

GitHub Private Vulnerability Reporting is already encrypted in transit and at
rest, so PGP is **not required**. If you nevertheless need to exchange a
secondary out-of-band channel (e.g. you are sharing exploit binaries that
exceed GitHub's attachment quota), request a key fingerprint inside the
private advisory thread before sending anything sensitive.

## Disclosure Policy

We adhere to a **90-day responsible disclosure policy**. When a report is received, we will:

1. **Acknowledge receipt** within 48 hours
2. **Confirm the vulnerability** within 7 days
3. **Investigate and develop a patch** within 30 days (for most issues)
4. **Coordinate public disclosure** with the researcher once a patch is released, or if the 90-day period elapses

### What We Promise

- We will respond to your report promptly
- We will keep you informed about our progress
- We will credit you (if desired) in our security advisories
- We will not take legal action against researchers who follow responsible disclosure practices

## Security Update Process

1. Security patches are released as soon as possible after verification
2. Critical vulnerabilities receive priority treatment
3. All security updates are documented in release notes
4. Users are notified through GitHub Security Advisories

## Security Best Practices for Contributors

### Code Review Requirements

- All code changes must be reviewed before merging
- Security-sensitive changes require additional review
- Automated security scanning must pass

### Dependency Management

- Dependencies are regularly audited for vulnerabilities
- Dependabot is enabled for automatic security updates
- Lock files are committed to ensure reproducible builds

### Secrets Management

- Never commit secrets, tokens, or credentials
- Use environment variables for sensitive configuration
- Rotate secrets regularly

## Security Features

### Supply Chain Security

- GitHub Actions workflows use SHA-pinned dependencies for the release/security paths
- Static Code Analysis (CodeQL) for JS/TS and Python (`.github/workflows/codeql.yml`)
- Trojan Source detection is enabled (`.github/workflows/guard-trojan-source.yml`)
- **CycloneDX SBOM generation and schema validation are active release controls**
  via `pnpm sbom` / `pnpm sbom:validate` (see
  `scripts/generate-sbom.mjs`, `scripts/validate-sbom.mjs`, and
  `docs/SUPPLY_CHAIN_TRUST.md`). The pre-release `pnpm verify` gate refuses
  to advance without a green SBOM.
- npm Trusted Publishing with OIDC provenance — no `NPM_TOKEN` stored
  (`.github/workflows/publish-npm.yml`)
- Dependabot weekly updates grouped per ecosystem (`.github/dependabot.yml`)

### Runtime Security

- Content Security Policy headers (when deployed)
- Input validation and sanitization
- Secure defaults for all configurations

## Contact

Use **[GitHub Private Vulnerability Reporting](https://github.com/Kuonirad/MCOP-Framework-2.0/security/advisories/new)**
as the primary intake. It is the only channel guaranteed to reach the
maintainer team with the necessary access to investigate, patch, and
coordinate disclosure.

For non-sensitive questions: open a
[GitHub Discussion](https://github.com/Kuonirad/MCOP-Framework-2.0/discussions).

---

Thank you for helping keep MCOP Framework and its users safe!
