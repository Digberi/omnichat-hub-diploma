"use client"

import { bootstrap } from "@omnichat/observability/browser"

if (typeof window !== "undefined") {
  const endpoint = process.env.NEXT_PUBLIC_OBS_OTLP_ENDPOINT ?? ""

  // No auth header by design: the collector port (4319) is a CORS-allowlisted
  // public OTLP receiver, so we don't ship a Bearer token in the JS bundle.
  // Trust boundary is the collector's CORS allowlist + redaction processor.
  bootstrap({
    serviceName: "omnichat-web-client",
    instrumentations: ["document-load", "fetch", "user-interaction"],
    ...(process.env.NEXT_PUBLIC_OBS_DEPLOYMENT_ENV
      ? { deploymentEnv: process.env.NEXT_PUBLIC_OBS_DEPLOYMENT_ENV }
      : {}),
    exporter: { endpoint },
  })
}
