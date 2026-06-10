import { bootstrap } from "@omnichat/observability/expo"

const endpoint = process.env.EXPO_PUBLIC_OBS_OTLP_ENDPOINT ?? ""

// No auth header by design: the collector port (4319) is a public OTLP
// receiver -- the app bundle is reachable from any device, so we don't ship a
// Bearer token. Trust boundary is the collector's redaction processor.
bootstrap({
  serviceName: "omnichat-mobile",
  ...(process.env.EXPO_PUBLIC_OBS_DEPLOYMENT_ENV
    ? { deploymentEnv: process.env.EXPO_PUBLIC_OBS_DEPLOYMENT_ENV }
    : {}),
  exporter: { endpoint },
})
