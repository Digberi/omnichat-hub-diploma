-- Parse text body of existing Rozetka order/status messages into structured
-- Message.metadata so the inbox renders cards instead of plain text on first
-- deploy. Idempotent: skips rows where metadata is already populated.

-- ===== :created rows =====
-- Body shape (after PR #44/#48/#50):
--   📦 Замовлення #N створено
--   Сума: <amount> ₴
--   Статус: <name> (<id>)        OR        Статус: <id>
--   Дата: YYYY-MM-DD HH:MM:SS
--   Товари: <name1> ×<q1>, <name2> ×<q2>
--   Кількість позицій: <n>
--   Адмінка: <adminUrl>
--   Фото: <photoUrl>             (optional)
UPDATE "Message" m
SET "metadata" = jsonb_build_object(
  'kind', 'rozetka_order_created',
  'schemaVersion', 1,
  'orderId', substring(m."externalMessageId" from '^order:([0-9]+):'),
  'amount', coalesce(substring(m."text" from 'Сума:\s*([0-9.]+)\s*₴'), ''),
  'status',
    CASE
      WHEN m."text" ~ 'Статус:\s*[^\(\n]+\s*\(([0-9]+)\)'
      THEN jsonb_build_object(
        'id', substring(m."text" from 'Статус:\s*[^\(\n]+\s*\(([0-9]+)\)'),
        'name', trim(substring(m."text" from 'Статус:\s*([^\(\n]+?)\s*\([0-9]+\)'))
      )
      ELSE jsonb_build_object(
        'id', coalesce(substring(m."text" from 'Статус:\s*([0-9]+)\s*(?:\n|$)'), ''),
        'name', null
      )
    END,
  'createdAt', coalesce(substring(m."text" from 'Дата:\s*([0-9-]{10} [0-9:]{8})'), ''),
  'items', '[]'::jsonb,
  'photoUrl', substring(m."text" from 'Фото:\s*(\S+)'),
  'adminUrl',
    coalesce(
      substring(m."text" from 'Адмінка:\s*(\S+)'),
      'https://seller.rozetka.com.ua/main/orders/edit/' || substring(m."externalMessageId" from '^order:([0-9]+):')
    )
)
WHERE m."externalMessageId" LIKE 'order:%:created'
  AND m."metadata" IS NULL;

-- Per-row item parsing (Cyrillic names + commas → can't do as one regex).
DO $$
DECLARE
  rec RECORD;
  parts text[];
  part text;
  items jsonb;
BEGIN
  FOR rec IN
    SELECT id, "text" FROM "Message"
    WHERE "externalMessageId" LIKE 'order:%:created'
      AND "metadata" -> 'items' = '[]'::jsonb
      AND "text" ~ 'Товари:\s*'
  LOOP
    items := '[]'::jsonb;
    part := substring(rec."text" from 'Товари:\s*([^\n]+)');
    IF part IS NOT NULL THEN
      parts := regexp_split_to_array(part, ',\s*');
      FOREACH part IN ARRAY parts LOOP
        IF part ~ '×[0-9]+\s*$' THEN
          items := items || jsonb_build_array(
            jsonb_build_object(
              'name', regexp_replace(part, '\s*×[0-9]+\s*$', ''),
              'quantity', (regexp_replace(part, '^.+?×([0-9]+)\s*$', E'\\1'))::int
            )
          );
        END IF;
      END LOOP;
    END IF;
    UPDATE "Message" SET "metadata" = jsonb_set("metadata", '{items}', items) WHERE id = rec.id;
  END LOOP;
END $$;

-- ===== :status rows =====
-- Body shape:
--   🔄 Замовлення #N: <fromName> (<fromId>) → <toName> (<toId>)
--     OR (when fallback table doesn't have one of them):
--   🔄 Замовлення #N: <fromId> → <toId>
--   Адмінка: <adminUrl>
UPDATE "Message" m
SET "metadata" = jsonb_build_object(
  'kind', 'rozetka_order_status_changed',
  'schemaVersion', 1,
  'orderId', substring(m."externalMessageId" from '^order:([0-9]+):'),
  'from',
    CASE
      WHEN m."text" ~ 'Замовлення #[0-9]+:\s*[^\(]+\s*\(([0-9]+)\)\s*→'
      THEN jsonb_build_object(
        'id', substring(m."text" from 'Замовлення #[0-9]+:\s*[^\(]+\s*\(([0-9]+)\)\s*→'),
        'name', trim(substring(m."text" from 'Замовлення #[0-9]+:\s*([^\(]+?)\s*\([0-9]+\)\s*→'))
      )
      ELSE jsonb_build_object(
        'id', coalesce(substring(m."text" from 'Замовлення #[0-9]+:\s*([0-9]+)\s*→'), ''),
        'name', null
      )
    END,
  'to',
    CASE
      WHEN m."text" ~ '→\s*[^\(\n]+\s*\(([0-9]+)\)'
      THEN jsonb_build_object(
        'id', substring(m."text" from '→\s*[^\(\n]+\s*\(([0-9]+)\)'),
        'name', trim(substring(m."text" from '→\s*([^\(\n]+?)\s*\([0-9]+\)'))
      )
      ELSE jsonb_build_object(
        'id', coalesce(substring(m."text" from '→\s*([0-9]+)\s*(?:\n|$)'), ''),
        'name', null
      )
    END,
  'adminUrl',
    coalesce(
      substring(m."text" from 'Адмінка:\s*(\S+)'),
      'https://seller.rozetka.com.ua/main/orders/edit/' || substring(m."externalMessageId" from '^order:([0-9]+):')
    )
)
WHERE m."externalMessageId" LIKE 'order:%:status:%'
  AND m."metadata" IS NULL;
