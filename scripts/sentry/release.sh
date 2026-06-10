#!/usr/bin/env bash
set -euo pipefail

# CI-oriented helper: creates/finalizes a release and uploads sourcemaps for Node services.
# Web sourcemaps are uploaded automatically during `next build` when apps/web env vars are set.
#
# Required:
# - SENTRY_AUTH_TOKEN
# - SENTRY_ORG
# - SENTRY_RELEASE
#
# Optional (when set, uploads):
# - SENTRY_PROJECT_API
# - SENTRY_PROJECT_WORKERS
# - SENTRY_URL (self-hosted)

if [[ -z "${SENTRY_AUTH_TOKEN:-}" || -z "${SENTRY_ORG:-}" || -z "${SENTRY_RELEASE:-}" ]]; then
  echo "Skipping Sentry release automation (missing SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_RELEASE)"
  exit 0
fi

echo "Sentry release automation"
echo "  org:     ${SENTRY_ORG}"
echo "  release: ${SENTRY_RELEASE}"

declare -a PROJECTS=()
if [[ -n "${SENTRY_PROJECT_API:-}" ]]; then PROJECTS+=("${SENTRY_PROJECT_API}"); fi
if [[ -n "${SENTRY_PROJECT_WORKERS:-}" ]]; then PROJECTS+=("${SENTRY_PROJECT_WORKERS}"); fi

# Best-effort: create release for each project (idempotent).
for PROJECT in "${PROJECTS[@]:-}"; do
  pnpm exec sentry-cli releases new --project "${PROJECT}" "${SENTRY_RELEASE}" >/dev/null 2>&1 || true
done

if [[ -n "${SENTRY_PROJECT_API:-}" ]]; then
  echo "Uploading API sourcemaps"
  SENTRY_PROJECT="${SENTRY_PROJECT_API}" pnpm run sentry:upload:api
fi

if [[ -n "${SENTRY_PROJECT_WORKERS:-}" ]]; then
  echo "Uploading Workers sourcemaps"
  SENTRY_PROJECT="${SENTRY_PROJECT_WORKERS}" pnpm run sentry:upload:workers
fi

# Best-effort: finalize release for each project.
for PROJECT in "${PROJECTS[@]:-}"; do
  pnpm exec sentry-cli releases finalize --project "${PROJECT}" "${SENTRY_RELEASE}" >/dev/null 2>&1 || true
done
