# syntax=docker/dockerfile:1.7
#
# Layered for build-cache reuse on DO App Platform:
#   stage `deps-cache`   pnpm fetch downloads everything the lockfile lists
#                        into the pnpm store. Invalidates only when
#                        pnpm-lock.yaml changes (which is rare).
#   stage `builder`      install --offline against that store, copy source,
#                        build shared packages then api. Source changes
#                        invalidate this stage but NOT deps-cache.
#   stage `runner`       slim runtime image, only what's needed to start.
#
# Old layout copied the whole repo before `pnpm install`, so any code change
# re-downloaded every dependency (~1.5 min wasted per deploy).

FROM node:22-bookworm-slim AS deps-cache
WORKDIR /repo
RUN corepack enable
# `package.json` carries the `packageManager: pnpm@X.Y.Z` field — corepack
# reads it on first pnpm invocation and downloads the pinned version. If
# we skip it here, deps-cache uses corepack-default pnpm but the builder
# stage then sees a different version, mismatches the store format, and
# `pnpm install --offline` hangs until the build slug is killed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `--filter @omnichat/api...` (note the trailing `...`) restricts the
# fetch closure to api and its workspace dependencies, skipping
# infra/pulumi entirely. That keeps the private @digberi/pulumi-infisical
# git-ref out of the docker build context — no ssh-agent forwarding or
# deploy-key dance needed, and the layer is significantly smaller.
RUN pnpm fetch --prod=false --filter "@omnichat/api..."

FROM deps-cache AS builder
# package.json already present from deps-cache; copy the rest of the
# workspace metadata + source.
COPY pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# --offline was intended to use the pnpm store from deps-cache stage but
# kaniko (DO's builder) doesn't reliably preserve the pnpm store dir
# across FROM stages — install hangs indefinitely on "Scope: all N
# workspace projects" with no further progress. Dropping --offline lets
# pnpm fall back to fetching missing packages from the registry; the
# deps-cache stage still warms the local store, just not as strictly.
RUN pnpm install --frozen-lockfile

# Build shared packages first (TypeScript resolves types from dist).
RUN pnpm --filter @omnichat/contracts build
RUN pnpm --filter @omnichat/domain build
RUN pnpm --filter @omnichat/db build
RUN pnpm --filter @omnichat/observability build
RUN pnpm --filter @omnichat/kms build

RUN pnpm --filter api build

FROM node:22-bookworm-slim AS runner

WORKDIR /repo
ENV NODE_ENV=production

COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/package.json /repo/package.json
COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-lock.yaml
COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-workspace.yaml
COPY --from=builder /repo/packages /repo/packages
COPY --from=builder /repo/apps/api /repo/apps/api

RUN chown -R node:node /repo
USER node

WORKDIR /repo/apps/api
EXPOSE 4121
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4121/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/main.js"]
