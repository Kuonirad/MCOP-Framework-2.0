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
ARG NODE_IMAGE=node:20-bookworm-slim@sha256:1b38aaddff63cd0d3a9b5b03863a71fd33ee62047dd2e915f494d96b4b9c18cc

# =============================================================================
# Stage 0: Base — activates the pnpm version declared in package.json#packageManager
# =============================================================================
FROM ${NODE_IMAGE} AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Corepack ships with Node 20 and honours packageManager in package.json.
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
