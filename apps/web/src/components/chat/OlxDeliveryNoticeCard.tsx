import { ExternalLink, Package } from 'lucide-react';
import { formatFullTime } from '@/lib/date-utils';
import type { OlxDeliveryNoticeMeta } from '@/types/messageMetadata';

interface OlxDeliveryNoticeCardProps {
  meta: OlxDeliveryNoticeMeta;
  timestamp: string;
  // Fallback advert info to use when meta.advert is null. Comes from
  // conversation.context* (populated by the worker lazy-fill / backfill
  // path after PR #74). Lets the rich card render for messages ingested
  // before the OLX flat-advert_id fix shipped.
  fallbackAdvert?: NonNullable<OlxDeliveryNoticeMeta['advert']> | null;
}

// Card variant of an OLX-Доставка system notification ("У вас придбали товар з
// OLX Доставкою!" etc).
//
// Two visual modes:
// 1) **Rich** — when `meta.advert` is populated (worker fetched product details
//    from /api/partner/adverts/{id}): shows product image, title, price, and
//    a "Перейти до оголошення" CTA that deep-links to the advert page. Mirrors
//    the Rozetka order-card UX.
// 2) **Bare** — when the advert fetch failed or wasn't possible (no advert id
//    on thread, deleted advert, missing scope): keeps the original notice text
//    + generic "Перейти до OLX Доставка" tab link.
export function OlxDeliveryNoticeCard({ meta, timestamp, fallbackAdvert }: OlxDeliveryNoticeCardProps) {
  const advert = meta.advert ?? fallbackAdvert ?? null;
  const hasRich = advert !== null && (advert.title || advert.imageUrl || advert.priceText || advert.advertUrl);

  return (
    <div className="max-w-[420px] w-full rounded-2xl border border-border bg-bubble-in text-bubble-in-foreground overflow-hidden">
      <div className="p-3 space-y-3">
        <div className="flex items-start gap-2">
          <div className="rounded-full bg-orange-500/15 text-orange-600 p-1.5 shrink-0" aria-hidden="true">
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-orange-600">
              OLX Доставка
            </p>
            <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{meta.notice}</p>
          </div>
        </div>

        {hasRich ? (
          <div className="rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
            {advert?.imageUrl ? (
              <a
                href={advert.advertUrl ?? meta.adminUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
                title={advert.title ?? 'Оголошення'}
              >
                <img
                  src={advert.imageUrl}
                  alt={advert.title ?? 'Оголошення'}
                  loading="lazy"
                  className="w-full max-h-64 object-cover"
                />
              </a>
            ) : null}
            {advert?.title || advert?.priceText ? (
              <div className="p-2.5 space-y-0.5">
                {advert.title ? (
                  <p className="text-sm font-medium break-words">{advert.title}</p>
                ) : null}
                {advert.priceText ? (
                  <p className="text-sm text-orange-700 font-semibold">{advert.priceText}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          {advert?.advertUrl ? (
            <a
              href={advert.advertUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-md bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 text-xs font-medium py-2 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Перейти до оголошення
            </a>
          ) : null}
          <a
            href={meta.adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-md bg-muted/50 hover:bg-muted/70 text-foreground/80 text-xs font-medium py-2 px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Перейти до OLX Доставка
          </a>
        </div>

        <time dateTime={timestamp} className="block text-[10px] text-muted-foreground">
          {formatFullTime(timestamp)}
        </time>
      </div>
    </div>
  );
}
