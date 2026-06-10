import { describe, expect, it } from "vitest"
import { buildResource } from "./resource"

describe("buildResource", () => {
  it("includes service.name", () => {
    const r = buildResource({ serviceName: "omnichat-api", deploymentEnv: "local" })
    expect(r.attributes["service.name"]).toBe("omnichat-api")
  })

  it("includes deployment.environment", () => {
    const r = buildResource({ serviceName: "x", deploymentEnv: "production" })
    expect(r.attributes["deployment.environment"]).toBe("production")
  })

  it("includes service.version when provided", () => {
    const r = buildResource({ serviceName: "x", deploymentEnv: "x", serviceVersion: "1.2.3" })
    expect(r.attributes["service.version"]).toBe("1.2.3")
  })

  it("omits service.version when not provided", () => {
    const r = buildResource({ serviceName: "x", deploymentEnv: "x" })
    expect(r.attributes["service.version"]).toBeUndefined()
  })
})
