import { describe, expect, it, vi } from "vitest"

import { OutboxPoller } from "./outbox.poller"

describe("OutboxPoller", () => {
  it("enqueues PENDING/FAILED/PROCESSING events that are due and not locked", async () => {
    const prisma: any = {
      outboxEvent: {
        findMany: vi.fn(async () => [{ id: "e1" }, { id: "e2" }]),
      },
    }
    const config: any = {
      get: vi.fn((key: string) => {
        if (key === "OUTBOX_POLL_INTERVAL_SEC") return 60
        if (key === "OUTBOX_MAX_ATTEMPTS") return 10
        if (key === "OUTBOX_LOCK_TTL_SEC") return 1
        return undefined
      }),
    }
    const logger: any = { info: vi.fn() }
    const queue: any = { add: vi.fn(async () => ({})) }

    const poller = new OutboxPoller(prisma, config, logger, queue)

    await (poller as any).tick()

    expect(prisma.outboxEvent.findMany).toHaveBeenCalledTimes(1)
    const where = (prisma.outboxEvent.findMany as any).mock.calls[0][0]?.where
    expect(where?.status?.in).toEqual(expect.arrayContaining(["PENDING", "FAILED", "PROCESSING"]))
    expect(queue.add).toHaveBeenCalledTimes(2)
  })
})

