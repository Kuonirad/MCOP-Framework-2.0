# OpenSSF Scorecard requires the base image to be pinned by digest.
# Refresh with: docker buildx imagetools inspect node:22.22.2-slim
FROM node:26.2.0-slim@sha256:1e738cb88890a15c71880323fbc35a739b7bbc703d72e8bfd1613128f8182f78 AS base

ENV NODE_ENV=production
WORKDIR /app

# Use the prebuilt server bundle (tsx for dev, tsc-compiled JS for prod).
# For the v0.1.0 ship we run via `node --experimental-strip-types`.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate \
    && pnpm config set manage-package-manager-versions false --global \
    && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --prod --ignore-scripts || true

COPY src ./src
COPY services ./services

EXPOSE 8767

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8767/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1

ENV MCOP_LEDGER_HOST=0.0.0.0 \
    MCOP_LEDGER_PORT=8767

CMD ["node", "--experimental-strip-types", "services/ledger/src/server.ts"]
