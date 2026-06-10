import { describe, expect, it, vi } from "vitest"

import { OutboxProcessor } from "./outbox.processor"

function createProcessor(input: {
  lockCount: number
  event: any | null
  pushResult?: boolean
}) {
  const updateMany = vi.fn(async () => ({ count: input.lockCount }))
  const findUnique = vi.fn(async () => input.event)
  const update = vi.fn(async () => ({}))

  const prisma: any = {
    outboxEvent: {
      updateMany,
      findUnique,
      update,
    },
  }

  const config: any = {
    get: vi.fn((key: string) => {
      if (key === "OUTBOX_MAX_ATTEMPTS") return 10
      if (key === "OUTBOX_LOCK_TTL_SEC") return 300
      return undefined
    }),
  }

  const emitter: any = {
    emitToWorkspace: vi.fn(),
  }

  const push: any = {
    deliverForOutboxEvent: vi.fn(async () => input.pushResult ?? false),
  }

  const logger: any = {
    error: vi.fn(),
  }

  const processor = new OutboxProcessor(prisma, config, emitter, push, logger)

  return { processor, prisma, emitter, push }
}

describe("OutboxProcessor", () => {
  it("does nothing when lock cannot be acquired", async () => {
    const { processor, prisma, emitter, push } = createProcessor({ lockCount: 0, event: null })

    await processor.process({ data: { outboxEventId: "e1" } } as any)

    expect(prisma.outboxEvent.findUnique).not.toHaveBeenCalled()
    expect(emitter.emitToWorkspace).not.toHaveBeenCalled()
    expect(push.deliverForOutboxEvent).not.toHaveBeenCalled()
  })

  it("emits websocket once and marks PROCESSED (no push)", async () => {
    const event = {
      id: "e1",
      workspaceId: "w1",
      type: "conversation.updated",
      payload: { schemaVersion: 1, workspaceId: "w1", occurredAt: new Date().toISOString(), data: {} },
      attempts: 0,
      wsDeliveredAt: null,
      pushDeliveredAt: null,
    }

    const { processor, prisma, emitter } = createProcessor({ lockCount: 1, event, pushResult: false })

    await processor.process({ data: { outboxEventId: "e1" } } as any)

    expect(emitter.emitToWorkspace).toHaveBeenCalledTimes(1)
    expect(prisma.outboxEvent.update).toHaveBeenCalled()

    // Should write wsDeliveredAt and finally mark PROCESSED.
    const updates = (prisma.outboxEvent.update as any).mock.calls.map((c: any[]) => c[0]?.data)
    expect(updates.some((d: any) => d && "wsDeliveredAt" in d)).toBe(true)
    expect(updates.some((d: any) => d && d.status === "PROCESSED")).toBe(true)
    expect(updates.some((d: any) => d && "pushDeliveredAt" in d)).toBe(false)
  })

  it("does not re-emit websocket when wsDeliveredAt already set", async () => {
    const event = {
      id: "e1",
      workspaceId: "w1",
      type: "conversation.updated",
      payload: { schemaVersion: 1, workspaceId: "w1", occurredAt: new Date().toISOString(), data: {} },
      attempts: 0,
      wsDeliveredAt: new Date(),
      pushDeliveredAt: null,
    }

    const { processor, prisma, emitter } = createProcessor({ lockCount: 1, event, pushResult: false })

    await processor.process({ data: { outboxEventId: "e1" } } as any)

    expect(emitter.emitToWorkspace).not.toHaveBeenCalled()

    const updates = (prisma.outboxEvent.update as any).mock.calls.map((c: any[]) => c[0]?.data)
    expect(updates.some((d: any) => d && d.status === "PROCESSED")).toBe(true)
  })

  it("writes pushDeliveredAt when PushService reports sending push", async () => {
    const event = {
      id: "e1",
      workspaceId: "w1",
      type: "message.new",
      payload: { schemaVersion: 1, workspaceId: "w1", occurredAt: new Date().toISOString(), data: {} },
      attempts: 0,
      wsDeliveredAt: new Date(),
      pushDeliveredAt: null,
    }

    const { processor, prisma, push } = createProcessor({ lockCount: 1, event, pushResult: true })

    await processor.process({ data: { outboxEventId: "e1" } } as any)

    expect(push.deliverForOutboxEvent).toHaveBeenCalledTimes(1)
    const updates = (prisma.outboxEvent.update as any).mock.calls.map((c: any[]) => c[0]?.data)
    expect(updates.some((d: any) => d && "pushDeliveredAt" in d)).toBe(true)
    expect(updates.some((d: any) => d && d.status === "PROCESSED")).toBe(true)
  })
})

