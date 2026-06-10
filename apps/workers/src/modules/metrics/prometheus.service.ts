import { Injectable } from "@nestjs/common"
import { Gauge, Registry, collectDefaultMetrics } from "prom-client"

import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class PrometheusService {
  private readonly registry = new Registry()
  private readonly outboxEvents = new Gauge({
    name: "omnichat_outbox_events",
    help: "Number of outbox events by status.",
    labelNames: ["status"] as const,
    registers: [this.registry],
  })
  private readonly outboxOldestPendingAgeSeconds = new Gauge({
    name: "omnichat_outbox_oldest_pending_age_seconds",
    help: "Age in seconds of the oldest pending/failed outbox event.",
    registers: [this.registry],
  })

  constructor(private readonly prisma: PrismaService) {
    collectDefaultMetrics({
      register: this.registry,
      prefix: "omnichat_workers_",
    })
  }

  async render(): Promise<string> {
    const [counts, oldestPending] = await Promise.all([
      this.prisma.outboxEvent.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.outboxEvent.findFirst({
        where: {
          status: {
            in: ["PENDING", "FAILED", "PROCESSING"],
          },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ])

    this.outboxEvents.reset()
    for (const row of counts) {
      this.outboxEvents.labels(row.status).set(row._count._all)
    }

    const oldestAgeSeconds = oldestPending
      ? Math.max(0, Math.round((Date.now() - oldestPending.createdAt.getTime()) / 1000))
      : 0
    this.outboxOldestPendingAgeSeconds.set(oldestAgeSeconds)

    return this.registry.metrics()
  }
}
