import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { parseObsEnv } from "./env"

describe("parseObsEnv", () => {
  const original = { ...process.env }
  beforeEach(() => { process.env = { ...original } })
  afterEach(() => { process.env = original })

  it("returns disabled when OBS_ENABLED is unset", () => {
    delete process.env.OBS_ENABLED
    const result = parseObsEnv()
    expect(result.enabled).toBe(false)
  })

  it("returns enabled with required fields when OBS_ENABLED=1", () => {
    process.env.OBS_ENABLED = "1"
    process.env.OBS_DEPLOYMENT_ENV = "production"
    process.env.OBS_OTLP_ENDPOINT = "https://collector.example/otlp"
    const result = parseObsEnv()
    expect(result.enabled).toBe(true)
    if (result.enabled) {
      expect(result.deploymentEnv).toBe("production")
      expect(result.otlpEndpoint).toBe("https://collector.example/otlp")
    }
  })

  it("throws when OBS_ENABLED=1 but OBS_DEPLOYMENT_ENV missing", () => {
    process.env.OBS_ENABLED = "1"
    delete process.env.OBS_DEPLOYMENT_ENV
    expect(() => parseObsEnv()).toThrow(/OBS_DEPLOYMENT_ENV/)
  })

  it("rejects 'grafana.net' endpoint when not production", () => {
    process.env.OBS_ENABLED = "1"
    process.env.OBS_DEPLOYMENT_ENV = "local"
    process.env.OBS_OTLP_ENDPOINT = "https://otlp-gateway-prod-eu-west-2.grafana.net/otlp"
    expect(() => parseObsEnv()).toThrow(/production-env guard/)
  })

  it("parses OBS_EXTRA_REDACT_KEYS as CSV", () => {
    process.env.OBS_ENABLED = "1"
    process.env.OBS_DEPLOYMENT_ENV = "production"
    process.env.OBS_OTLP_ENDPOINT = "http://localhost:4318"
    process.env.OBS_EXTRA_REDACT_KEYS = "foo, bar,baz"
    const result = parseObsEnv()
    if (result.enabled) {
      expect(result.extraRedactKeys).toEqual(["foo", "bar", "baz"])
    }
  })
})
