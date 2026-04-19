# MCOP Framework 2.0 - Production Dockerfile
#
# Build: docker build -t mcop-framework .
# Run:   docker run -p 3000:3000 mcop-framework
#
# Security Notes:
# - Uses non-root user for runtime
# - Multi-stage build to minimize attack surface
# - Production dependencies only in final image
# - Uses pnpm (matches repo lockfile: pnpm-lock.yaml)

# Base image is pinned by digest for reproducibility; update NODE_IMAGE intentionally.
ARG NODE_IMAGE=node:20-bookworm-slim@sha256:1b38aaddff63cd0d3a9b5b03863a71fd33ee62047dd2e915f494d96b4b9c18cc

# =============================================================================
# Stage 0: Base — enables corepack so pnpm resolves from packageManager field
# =============================================================================
FROM ${NODE_IMAGE} AS base

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# =============================================================================
# Stage 1: Dependencies (production-only)
# =============================================================================
FROM base AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Install production deps only. --frozen-lockfile enforces reproducibility.
RUN pnpm install --frozen-lockfile --prod

# =============================================================================
# Stage 2: Builder (full deps + source + next build)
# =============================================================================
FROM base AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Full install (dev deps included) so next build can run TypeScript/tailwind pipeline.
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build-time environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application (uses stable webpack builder, not turbopack, for production reliability)
RUN pnpm run build

# =============================================================================
# Stage 3: Runner (Production)
# =============================================================================
FROM ${NODE_IMAGE} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output artefacts (produced by output: "standalone" in next.config.ts)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Health check pings the Next.js health route
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
