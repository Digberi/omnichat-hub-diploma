import { ArrowRight, RefreshCw, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RozetkaOrderStatusChangedMeta } from "@/types/messageMetadata"
import { formatFullTime } from "@/lib/date-utils"

interface Props {
  meta: RozetkaOrderStatusChangedMeta
  timestamp: string
}

function pill(status: { id: string; name: string | null }): string {
  return status.name ? `${status.name} (${status.id})` : status.id
}

export function RozetkaOrderStatusChangedCard({ meta, timestamp }: Props) {
  return (
    <div
      className={cn(
        "max-w-md rounded-2xl border border-border bg-card text-card-foreground",
        "shadow-sm px-3 py-2.5 space-y-2",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <RefreshCw className="h-4 w-4" />
          <span>Замовлення #{meta.orderId}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{formatFullTime(timestamp)}</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{pill(meta.from)}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="rounded-full bg-primary/15 text-primary px-2 py-0.5 font-medium">
          {pill(meta.to)}
        </span>
      </div>

      <a
        href={meta.adminUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium",
          "text-primary hover:underline",
        )}
      >
        Відкрити в адмінці Розетки
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
