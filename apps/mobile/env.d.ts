// Expo provides runtime support for EXPO_PUBLIC_ env vars, but TypeScript doesn't know about it by default.
declare const process: {
  env: {
    NODE_ENV?: string
    EXPO_PUBLIC_API_BASE_URL?: string
    EXPO_PUBLIC_WS_URL?: string
    EXPO_PUBLIC_WS_PATH?: string
    EXPO_PUBLIC_SENTRY_DSN?: string
    EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE?: string
    EXPO_PUBLIC_SENTRY_ENVIRONMENT?: string
    EXPO_PUBLIC_SENTRY_RELEASE?: string
    EXPO_PUBLIC_OBS_OTLP_ENDPOINT?: string
    EXPO_PUBLIC_OBS_OTLP_AUTH?: string
    EXPO_PUBLIC_OBS_DEPLOYMENT_ENV?: string
  }
}
