#!/usr/bin/env bash
set -euo pipefail

DIR="${1:-}"
if [[ -z "$DIR" ]]; then
  echo "usage: $0 <dir>"
  echo "example: $0 apps/api/dist"
  exit 2
fi

if [[ ! -d "$DIR" ]]; then
  echo "directory not found: $DIR"
  exit 2
fi

if [[ -z "${SENTRY_AUTH_TOKEN:-}" || -z "${SENTRY_ORG:-}" || -z "${SENTRY_PROJECT:-}" || -z "${SENTRY_RELEASE:-}" ]]; then
  echo "Skipping Sentry sourcemap upload (missing one of: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_RELEASE)"
  exit 0
fi

URL_PREFIX="app:///${DIR}"
URL_PREFIX="${URL_PREFIX//\\/\\/}"

echo "Uploading sourcemaps to Sentry"
echo "  org:     ${SENTRY_ORG}"
echo "  project: ${SENTRY_PROJECT}"
echo "  release: ${SENTRY_RELEASE}"
echo "  dir:     ${DIR}"
echo "  prefix:  ${URL_PREFIX}"

pnpm exec sentry-cli releases new --project "${SENTRY_PROJECT}" "${SENTRY_RELEASE}" >/dev/null 2>&1 || true
pnpm exec sentry-cli sourcemaps upload \
  --release "${SENTRY_RELEASE}" \
  --url-prefix "${URL_PREFIX}" \
  --validate \
  --rewrite \
  "${DIR}"

pnpm exec sentry-cli releases finalize --project "${SENTRY_PROJECT}" "${SENTRY_RELEASE}" >/dev/null 2>&1 || true
