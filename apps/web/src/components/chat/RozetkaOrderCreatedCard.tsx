import { Package, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RozetkaOrderCreatedMeta } from "@/types/messageMetadata"
import { formatFullTime } from "@/lib/date-utils"

interface Props {
  meta: RozetkaOrderCreatedMeta
  timestamp: string
}

function statusLabel(status: { id: string; name: string | null }): string {
  return status.name ? `${status.name} (${status.id})` : status.id
}

export function RozetkaOrderCreatedCard({ meta, timestamp }: Props) {
  return (
    <div
      className={cn(
        "max-w-md rounded-2xl border border-border bg-card text-card-foreground",
        "shadow-sm overflow-hidden",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4" />
          <span>Замовлення #{meta.orderId} створено</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{formatFullTime(timestamp)}</span>
      </div>

      {meta.photoUrl ? (
        <div className="mt-2 px-3">
          <img
            src={meta.photoUrl}
            alt={meta.items[0]?.name ?? `Order ${meta.orderId}`}
            loading="lazy"
            className="rounded-lg max-h-60 w-auto object-cover border border-border/50"
          />
        </div>
      ) : null}

      <div className="px-3 pt-3 space-y-1.5 text-sm">
        {meta.amount ? (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Сума</span>
            <span className="font-semibold tabular-nums">{meta.amount} ₴</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Статус</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
            {statusLabel(meta.status)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Дата</span>
          <span className="tabular-nums">{meta.createdAt}</span>
        </div>
      </div>

      {meta.items.length > 0 ? (
        <div className="px-3 mt-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Товари
          </div>
          <ul className="space-y-1 text-sm max-h-32 overflow-y-auto">
            {meta.items.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{item.name}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">×{item.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="px-3 py-3 mt-2 border-t border-border/50">
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
    </div>
  )
}
