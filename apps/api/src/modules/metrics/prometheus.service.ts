import { Injectable } from "@nestjs/common"
import { Gauge, Registry, collectDefaultMetrics } from "prom-client"

import { MetricsService } from "./metrics.service"

@Injectable()
export class PrometheusService {
  private readonly registry = new Registry()
  private readonly storageHealthStatus = new Gauge({
    name: "omnichat_storage_health_status",
    help: "Storage health status (one-hot by status label).",
    labelNames: ["status"] as const,
    registers: [this.registry],
  })
  private readonly storagePingAgeMs = new Gauge({
    name: "omnichat_storage_ping_age_ms",
    help: "Age of the last successful storage ping in milliseconds.",
    registers: [this.registry],
  })
  private readonly storageOperationTotal = new Gauge({
    name: "omnichat_storage_operation_total",
    help: "Total storage operations by operation name.",
    labelNames: ["operation"] as const,
    registers: [this.registry],
  })
  private readonly storageOperationFailed = new Gauge({
    name: "omnichat_storage_operation_failed_total",
    help: "Failed storage operations by operation name.",
    labelNames: ["operation"] as const,
    registers: [this.registry],
  })
  private readonly storageOperationAvgDurationMs = new Gauge({
    name: "omnichat_storage_operation_avg_duration_ms",
    help: "Average storage operation duration in milliseconds by operation name.",
    labelNames: ["operation"] as const,
    registers: [this.registry],
  })

  constructor(private readonly metrics: MetricsService) {
    collectDefaultMetrics({
      register: this.registry,
      prefix: "omnichat_api_",
    })
  }

  async render(): Promise<string> {
    const [storageMetrics, storageHealth] = await Promise.all([
      this.metrics.getStorageMetrics(),
      this.metrics.getStorageHealth(),
    ])

    for (const status of ["ok", "degraded", "critical"] as const) {
      this.storageHealthStatus.labels(status).set(storageHealth.status === status ? 1 : 0)
    }

    const pingAgeMs =
      storageMetrics.lastPingAt && !Number.isNaN(Date.parse(storageMetrics.lastPingAt))
        ? Math.max(0, Date.now() - Date.parse(storageMetrics.lastPingAt))
        : -1
    this.storagePingAgeMs.set(pingAgeMs)

    this.storageOperationTotal.reset()
    this.storageOperationFailed.reset()
    this.storageOperationAvgDurationMs.reset()

    for (const [operation, metric] of Object.entries(storageMetrics.operations ?? {})) {
      this.storageOperationTotal.labels(operation).set(metric.total ?? 0)
      this.storageOperationFailed.labels(operation).set(metric.failed ?? 0)
      this.storageOperationAvgDurationMs.labels(operation).set(metric.avgDurationMs ?? 0)
    }

    return this.registry.metrics()
  }
}
