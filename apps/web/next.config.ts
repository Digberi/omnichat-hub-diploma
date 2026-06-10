import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryUrl = process.env.SENTRY_URL;
const sentryRelease = process.env.SENTRY_RELEASE || process.env.NEXT_PUBLIC_SENTRY_RELEASE;

const isSentryUploadEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  ...(isSentryUploadEnabled ? { productionBrowserSourceMaps: true } : {}),
};

export default isSentryUploadEnabled
  ? withSentryConfig(
      nextConfig,
      {
        org: sentryOrg!,
        project: sentryProject!,
        authToken: sentryAuthToken!,
        ...(sentryUrl ? { sentryUrl } : {}),
        silent: true,
        release: {
          ...(sentryRelease ? { name: sentryRelease } : {}),
        },
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      },
    )
  : nextConfig;
