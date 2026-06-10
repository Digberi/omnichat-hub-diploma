import * as cloudflare from "@pulumi/cloudflare"
import * as pulumi from "@pulumi/pulumi"
import type * as vercel from "@pulumiverse/vercel"

import type { DeploymentConfig } from "./config"

export type CloudflareResources = {
  zoneId: pulumi.Input<string>
  zoneMode: "existing" | "managed"
  zoneNameServers: pulumi.Output<string[]>
}

export function createCloudflareResources(
  config: DeploymentConfig,
  runtimeAppDefaultIngress: any,
  rootDomainConfig: pulumi.Output<vercel.GetDomainConfigResult>,
  webDomainConfig: pulumi.Output<vercel.GetDomainConfigResult>,
  wwwDomainConfig: pulumi.Output<vercel.GetDomainConfigResult>,
): CloudflareResources {
  let zoneId: pulumi.Input<string>
  let zoneMode: "existing" | "managed"
  let zoneNameServers: pulumi.Output<string[]>

  if (config.cloudflareZoneId) {
    zoneId = config.cloudflareZoneId
    zoneMode = "existing"
    zoneNameServers = pulumi.output(["Managed outside Pulumi: existing Cloudflare zone"])
  } else {
    const zone = new cloudflare.Zone("root-zone", {
      account: { id: config.cloudflareAccountId! },
      name: config.rootDomain,
      paused: true,
      type: "full",
    })
    zoneId = zone.id
    zoneMode = "managed"
    zoneNameServers = zone.nameServers
  }

  const rootRecommendedCname = rootDomainConfig.apply((value) => value.recommendedCname)
  const rootRecommendedIpv4s = rootDomainConfig.apply((value) => value.recommendedIpv4s)
  const webRecommendedCname = webDomainConfig.apply((value) => value.recommendedCname)
  const wwwRecommendedCname = wwwDomainConfig.apply((value) => value.recommendedCname)

  pulumi.all([rootRecommendedIpv4s, rootRecommendedCname]).apply(([records, cname]) => {
    if (records.length > 0) {
      records.forEach((record, index) => {
        new cloudflare.DnsRecord(`root-a-${index + 1}`, {
          zoneId,
          name: "@",
          type: "A",
          content: record,
          proxied: false,
          ttl: 1,
        })
      })
      return undefined
    }

    if (!cname) {
      return undefined
    }

    return new cloudflare.DnsRecord("root-cname", {
      zoneId,
      name: "@",
      type: "CNAME",
      content: cname,
      proxied: false,
      ttl: 1,
    })
  })

  new cloudflare.DnsRecord("www-cname", {
    zoneId,
    name: "www",
    type: "CNAME",
    content: wwwRecommendedCname,
    proxied: false,
    ttl: 1,
  })

  if (config.appDomain === config.rootDomain) {
    return { zoneId, zoneMode, zoneNameServers }
  } else {
    new cloudflare.DnsRecord("app-cname", {
      zoneId,
      name: config.appSubdomain,
      type: "CNAME",
      content: webRecommendedCname,
      proxied: false,
      ttl: 1,
    })
  }

  const apiCnameTarget = runtimeAppDefaultIngress.apply((value: string) =>
    value.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  )
  apiCnameTarget.apply((target: string) => {
    if (!target) {
      return undefined
    }

    return new cloudflare.DnsRecord("api-cname", {
      zoneId,
      name: config.apiSubdomain,
      type: "CNAME",
      content: target,
      proxied: false,
      ttl: 1,
    })
  })

  return { zoneId, zoneMode, zoneNameServers }
}
