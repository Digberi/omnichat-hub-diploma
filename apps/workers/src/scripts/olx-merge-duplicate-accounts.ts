/**
 * One-shot prod cleanup — DO NOT KEEP IN MAIN.
 *
 * Companion to the dedup-by-alias fix in
 * apps/api/src/modules/channel-accounts/channel-accounts.repository.ts.
 *
 * Before the fix, a transient /users/me failure during OLX OAuth callback
 * left externalAccountId=NULL on the new row, which silently skipped the
 * dedup check and CREATEd a second ChannelAccount row for the same OLX
 * seller. Both rows then polled identical OLX data, producing 1:1
 * duplicate Conversation+Message records.
 *
 * This script keeps the OLDER row (more history) and cascade-deletes the
 * NEWER duplicate. Both rows poll the same OLX user → identical OLX data
 * → the doomed row holds no unique messages. Schema cascades handle
 * ChannelSyncCheckpoint, Conversation, Message, MessageAttachment, and
 * ConversationTag in one transaction.
 *
 * Run via DigitalOcean App Platform → omnichat-prod → workers → Console:
 *
 *   node dist/scripts/olx-merge-duplicate-accounts.js | tee /tmp/olxdup.jsonl
 *
 * Idempotent: a second run reports zero duplicate groups. Dry-run by
 * default — pass DRY_RUN=0 to commit the delete.
 */
import { PrismaClient } from "@omnichat/db"

const DRY_RUN = process.env.DRY_RUN !== "0"

function emit(rec: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(rec)}\n`)
}

type DuplicateGroup = {
  workspaceId: string
  alias: string
  keeperId: string
  doomedIds: string[]
}

async function findDuplicateGroups(prisma: PrismaClient): Promise<DuplicateGroup[]> {
  const rows = await prisma.channelAccount.findMany({
    where: { channel: "OLX" },
    select: { id: true, workspaceId: true, alias: true, createdAt: true },
    orderBy: [{ workspaceId: "asc" }, { alias: "asc" }, { createdAt: "asc" }],
  })
  const byKey = new Map<string, { id: string; createdAt: Date }[]>()
  for (const r of rows) {
    const key = `${r.workspaceId}::${r.alias}`
    const bucket = byKey.get(key) ?? []
    bucket.push({ id: r.id, createdAt: r.createdAt })
    byKey.set(key, bucket)
  }
  const groups: DuplicateGroup[] = []
  for (const [key, bucket] of byKey.entries()) {
    if (bucket.length < 2) continue
    const [workspaceId, alias] = key.split("::") as [string, string]
    bucket.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const keeper = bucket[0]!
    const doomed = bucket.slice(1).map((b) => b.id)
    groups.push({ workspaceId, alias, keeperId: keeper.id, doomedIds: doomed })
  }
  return groups
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  emit({ kind: "begin", dryRun: DRY_RUN })

  const groups = await findDuplicateGroups(prisma)
  emit({ kind: "groups_found", count: groups.length })

  for (const g of groups) {
    emit({
      kind: "group",
      workspaceId: g.workspaceId,
      alias: g.alias,
      keeperId: g.keeperId,
      doomedIds: g.doomedIds,
    })

    for (const doomedId of g.doomedIds) {
      const stats = await prisma.conversation.aggregate({
        where: { channelAccountId: doomedId },
        _count: { _all: true },
      })
      const messageCount = await prisma.message.count({
        where: { conversation: { channelAccountId: doomedId } },
      })
      emit({
        kind: "doomed_summary",
        doomedId,
        conversations: stats._count._all,
        messages: messageCount,
      })

      if (DRY_RUN) continue

      // Disable first so the worker poller drops it from the rotation if
      // a backlog job races with the delete below.
      await prisma.channelAccount.update({
        where: { id: doomedId },
        data: { isEnabled: false },
      })
      emit({ kind: "doomed_disabled", doomedId })

      // Cascade delete: ChannelAccount → ChannelSyncCheckpoint,
      // Conversation → Message + ConversationTag + MessageAttachment.
      const deleted = await prisma.channelAccount.delete({
        where: { id: doomedId },
      })
      emit({ kind: "doomed_deleted", doomedId, deletedAt: deleted.id })
    }
  }

  emit({ kind: "summary", groupCount: groups.length, dryRun: DRY_RUN })
  await prisma.$disconnect()
}

main().catch((err) => {
  emit({
    kind: "fatal",
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
  })
  process.exit(1)
})
