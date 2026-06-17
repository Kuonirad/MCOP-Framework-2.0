# MCOP Framework 2.0 - Production Dockerfile
#
# Build: docker build -t mcop-framework .
# Run:   docker run -p 3000:3000 mcop-framework
#
# Security Notes:
# - Uses non-root user for runtime
# - Multi-stage build to minimize attack surface
# - Production dependencies only in final image
# - pnpm (via Corepack) is the canonical package manager for this repo

# Base image is pinned by digest for reproducibility; update NODE_IMAGE intentionally.
# Node 22.22.3 matches `.nvmrc`, README quick-start, CI, and `engines.node`.
# This closes the Phase I Node runtime drift recorded in
# docs/audits/audit-execution-ledger-2026-05-v2.md.
ARG NODE_IMAGE=node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752

# =============================================================================
# Stage 0: Base — activates the pnpm version declared in package.json#packageManager
# =============================================================================
FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Corepack ships with Node 22 and honours packageManager in package.json.
RUN corepack enable

# =============================================================================
# Stage 1: Builder — installs all deps and produces the Next standalone output
# =============================================================================
FROM base AS builder

WORKDIR /app

# Copy manifests first so the install layer caches independently of source churn.
COPY package.json pnpm-lock.yaml .npmrc ./

# Install the exact toolchain version requested by package.json#packageManager.
RUN corepack prepare --activate

# Full install (dev deps needed for `next build`).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Copy the rest of the source and build.
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

# =============================================================================
# Stage 2: Runner — minimal production image using Next standalone output
# =============================================================================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output bundles the minimal set of production deps already,
# so we do not need a separate `pnpm install --prod` stage here.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
