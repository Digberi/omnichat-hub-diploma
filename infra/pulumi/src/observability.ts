import * as pulumi from "@pulumi/pulumi"

import type { DeploymentConfig } from "./config"
import { GrafanaCloudResource } from "./grafana-cloud-resource"

export type ObservabilityResources = {
  enabled: boolean
  grafanaStackUrl?: pulumi.Output<string>
  grafanaStackSlug?: pulumi.Output<string>
  grafanaStackId?: pulumi.Output<string>
  grafanaRegionSlug?: pulumi.Output<string>
  lokiInstanceId?: pulumi.Output<string>
  prometheusInstanceId?: pulumi.Output<string>
  lokiHost?: pulumi.Output<string>
  lokiUsername?: pulumi.Output<string>
  lokiPassword?: pulumi.Output<string>
  prometheusRemoteWriteUrl?: pulumi.Output<string>
  prometheusUsername?: pulumi.Output<string>
  prometheusPassword?: pulumi.Output<string>
  grafanaOtlpToken?: pulumi.Output<string>
}

export function createObservabilityResources(config: DeploymentConfig): ObservabilityResources {
  if (!config.grafanaCloudAccessPolicyToken || !config.grafanaStackSlug) {
    return { enabled: false }
  }

  const grafana = new GrafanaCloudResource("grafana-cloud", {
    accessPolicyToken: config.grafanaCloudAccessPolicyToken,
    stackSlug: config.grafanaStackSlug,
    logsPolicyName: `${config.grafanaStackSlug}-logs-write`,
    logsPolicyDisplayName: "OmniChat logs write",
    logsTokenName: `${config.grafanaStackSlug}-logs-token`,
    logsTokenDisplayName: "OmniChat logs ingest token",
    metricsPolicyName: `${config.grafanaStackSlug}-metrics-write`,
    metricsPolicyDisplayName: "OmniChat metrics write",
    metricsTokenName: `${config.grafanaStackSlug}-metrics-token`,
    metricsTokenDisplayName: "OmniChat metrics ingest token",
    otlpPolicyName: `${config.grafanaStackSlug}-otlp-write`,
    otlpPolicyDisplayName: "OmniChat OTLP unified write",
    otlpTokenName: `${config.grafanaStackSlug}-otlp-token`,
    otlpTokenDisplayName: "OmniChat OTLP ingest token (logs+metrics+traces)",
  })

  return {
    enabled: true,
    grafanaStackUrl: grafana.stackUrl,
    grafanaStackSlug: grafana.stackSlug,
    grafanaStackId: grafana.stackId,
    grafanaRegionSlug: grafana.regionSlug,
    lokiInstanceId: grafana.lokiInstanceId,
    prometheusInstanceId: grafana.prometheusInstanceId,
    lokiHost: grafana.lokiHost,
    lokiUsername: grafana.lokiUsername,
    lokiPassword: grafana.lokiPassword,
    prometheusRemoteWriteUrl: grafana.prometheusRemoteWriteUrl,
    prometheusUsername: grafana.prometheusUsername,
    prometheusPassword: grafana.prometheusPassword,
    grafanaOtlpToken: grafana.otlpToken,
  }
}
