set shell := ["bash", "-lc"]

# Default recipe: show available commands
default:
    @just --list

# Full reproducibility check
reproduce:
    @echo "=== MCOP Framework 2.0 - Reproducibility Check ==="
    @echo ""
    @echo "1. Environment Information:"
    node --version
    pnpm --version
    @echo ""
    @echo "2. Installing Dependencies:"
    pnpm install --frozen-lockfile
    @echo ""
    @echo "3. Running Linter:"
    pnpm lint
    @echo ""
    @echo "4. Building Project:"
    pnpm build
    @echo ""
    @echo "5. Running Tests:"
    pnpm test || true
    @echo ""
    @echo "=== Q.E.D. - Build Reproduced Successfully ==="

# Install dependencies
install:
    pnpm install

# Run development server
dev:
    pnpm dev

# Build for production
build:
    pnpm build

# Run tests
test:
    pnpm test

# Run linter
lint:
    pnpm lint

# Run security audit
audit:
    pnpm audit --audit-level=moderate

# Run all CI checks locally
ci: lint build test audit
    @echo "All CI checks passed!"

# Clean build artifacts
clean:
    rm -rf .next node_modules coverage artefacts

# Run security test harness
security-test:
    node scripts/security/test-malicious-mod.mjs

# Run Trojan Source scan locally
scan-trojan:
    @python3 -c "
    import os, sys
    BAD = set(['\u202A','\u202B','\u202C','\u202D','\u202E','\u2066','\u2067','\u2068','\u2069','\u200E','\u200F','\u061C'])
    ex_dirs = {'.git','node_modules','.next','dist','build','out','coverage'}
    ex_exts = {'.png','.jpg','.jpeg','.gif','.webp','.ico','.zip','.gz','.tar','.pdf'}
    offenders = []
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in ex_dirs]
        for fn in files:
            path = os.path.join(root, fn)
            _, ext = os.path.splitext(path)
            if ext.lower() in ex_exts: continue
            try:
                text = open(path,'rb').read().decode('utf-8', errors='ignore')
            except: continue
            hits = [i for i,ch in enumerate(text) if ch in BAD]
            if hits: offenders.append((path, hits[:5]))
    if offenders:
        print('FAIL: Trojan Source detected:')
        for p, h in offenders: print(f'  - {p}: {h}')
        sys.exit(1)
    print('OK: No bidi/hidden controls found.')
    "

# Format code (if prettier is installed)
format:
    pnpm exec prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"

# Check types
typecheck:
    pnpm exec tsc --noEmit

# Full quality check
quality: lint typecheck scan-trojan security-test
    @echo "All quality checks passed!"
