# MCOP Framework 2.0 - Production Dockerfile
# 
# Build: docker build -t mcop-framework .
# Run:   docker run -p 3000:3000 mcop-framework
#
# Security Notes:
# - Uses non-root user for runtime
# - Multi-stage build to minimize attack surface
# - Production dependencies only in final image

# Base image is pinned by digest for reproducibility; update NODE_IMAGE intentionally.
ARG NODE_IMAGE=node:20-bookworm-slim@sha256:1b38aaddff63cd0d3a9b5b03863a71fd33ee62047dd2e915f494d96b4b9c18cc

# =============================================================================
# Stage 0: Base
# =============================================================================
FROM ${NODE_IMAGE} AS base

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM base AS deps

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install dependencies with exact versions from lockfile
RUN npm ci --only=production && npm cache clean --force

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM base AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# =============================================================================
# Stage 3: Runner (Production)
# =============================================================================
FROM base AS runner

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set ownership to non-root user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start the application
CMD ["node", "server.js"]
