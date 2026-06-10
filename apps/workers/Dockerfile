# syntax=docker/dockerfile:1.7
#
# Same layered cache pattern as apps/api/Dockerfile — see that file for the
# rationale. deps-cache (pnpm fetch) is reused across deploys until
# pnpm-lock.yaml changes; builder is invalidated by source changes but does
# NOT re-download dependencies.

FROM node:22-bookworm-slim AS deps-cache
WORKDIR /repo
RUN corepack enable
# See apps/api/Dockerfile — package.json pins the pnpm version corepack
# uses, must be present BEFORE pnpm fetch or the store format mismatches
# between stages.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `--filter @omnichat/workers...` restricts the fetch closure to
# workers + its workspace deps, skipping infra/pulumi (which carries
# the private @digberi/pulumi-infisical git-ref). See apps/api/Dockerfile.
RUN pnpm fetch --prod=false --filter "@omnichat/workers..."

FROM deps-cache AS builder
COPY pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/workers ./apps/workers
# See apps/api/Dockerfile — kaniko + DO doesn't preserve the pnpm store
# across FROM stages reliably; --offline hangs forever. Drop the flag.
RUN pnpm install --frozen-lockfile

# Build shared packages first (TypeScript resolves types from dist).
RUN pnpm --filter @omnichat/contracts build
RUN pnpm --filter @omnichat/domain build
RUN pnpm --filter @omnichat/db build
RUN pnpm --filter @omnichat/observability build
RUN pnpm --filter @omnichat/kms build

RUN pnpm --filter workers build

FROM node:22-bookworm-slim AS runner

WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-lock.yaml
COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-workspace.yaml
COPY --from=builder /repo/packages /repo/packages
COPY --from=builder /repo/apps/workers /repo/apps/workers

RUN chown -R node:node /repo
USER node

WORKDIR /repo/apps/workers
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "try { process.kill(1, 0); process.exit(0) } catch (error) { process.exit(1) }"]

CMD ["node", "dist/main.js"]
