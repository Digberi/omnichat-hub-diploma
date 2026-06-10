-- Re-process Rozetka order/status messages stored before / after the
-- HTML-strip migration to:
--   1) Re-insert "Адмінка: https://seller.rozetka.com.ua/main/orders/edit/{id}"
--      (the previous strip migration stripped the <a> tag including the href
--      attribute, leaving only "Відкрити в адмінці Розетки" without a URL).
--   2) Re-write bare numeric status codes into "Name (id)" form for the
--      well-known set, mirroring the runtime ROZETKA_STATUS_FALLBACK in
--      apps/workers/src/modules/channel-sync/rozetka-order-sync.service.ts.

-- Step 1: append the admin URL on rows where it's missing.
-- externalMessageId looks like "order:<id>:created" or "order:<id>:status:..."
-- so we extract the order id from there. We only touch rows whose text contains
-- "Відкрити в адмінці Розетки" but not "Адмінка:" (idempotency guard).
UPDATE "Message" m
SET "text" = trim(both E'\n' from m."text") || E'\n' ||
  'Адмінка: https://seller.rozetka.com.ua/main/orders/edit/' ||
  substring(m."externalMessageId" from '^order:([0-9]+):')
WHERE m."externalMessageId" ~ '^order:[0-9]+:'
  AND m."text" LIKE '%Відкрити в адмінці Розетки%'
  AND m."text" NOT LIKE '%Адмінка:%';

-- Step 2: drop the now-redundant "Відкрити в адмінці Розетки" line that was
-- left over from the stripped <a> tag.
UPDATE "Message" m
SET "text" = regexp_replace(m."text", E'(\\s*\n)?Відкрити в адмінці Розетки\\s*', '', 'g')
WHERE m."externalMessageId" ~ '^order:[0-9]+:'
  AND m."text" LIKE '%Відкрити в адмінці Розетки%';

-- Step 3: rewrite "Замовлення #X: A → B" lines so A and B get human names.
-- Repeats per known status; idempotent (already-named rows skip via NOT LIKE guard).
DO $$
DECLARE
  status_id text;
  status_name text;
  pairs text[][] := ARRAY[
    ['1', 'Новий'],
    ['2', 'На розгляді'],
    ['23', 'Підтверджено'],
    ['26', 'Очікує оплати'],
    ['29', 'Оплачено'],
    ['44', 'Скомплектовано'],
    ['50', 'Скасовано'],
    ['55', 'Готовий до видачі'],
    ['61', 'На відправку'],
    ['63', 'Передано перевізнику'],
    ['70', 'У дорозі'],
    ['75', 'Прибуло у відділення'],
    ['78', 'Очікує отримувача'],
    ['80', 'Доставлено'],
    ['87', 'Видано клієнту'],
    ['88', 'Завершено']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(pairs, 1) LOOP
    status_id := pairs[i][1];
    status_name := pairs[i][2];

    -- Replace " <id> → " with " <name> (<id>) → " in status-change line.
    UPDATE "Message"
    SET "text" = regexp_replace(
      "text",
      '(Замовлення #[0-9]+: )' || status_id || ' → ',
      E'\\1' || status_name || ' (' || status_id || ') → ',
      'g'
    )
    WHERE "externalMessageId" LIKE 'order:%:status:%'
      AND "text" ~ ('Замовлення #[0-9]+: ' || status_id || ' → ');

    -- Replace " → <id>" terminal in status-change line.
    UPDATE "Message"
    SET "text" = regexp_replace(
      "text",
      ' → ' || status_id || '($|\n)',
      ' → ' || status_name || ' (' || status_id || E')\\1',
      'g'
    )
    WHERE "externalMessageId" LIKE 'order:%:status:%'
      AND "text" ~ (' → ' || status_id || '($|\n)');

    -- Replace "Статус: <id>" line in created message.
    UPDATE "Message"
    SET "text" = regexp_replace(
      "text",
      'Статус: ' || status_id || '($|\n)',
      'Статус: ' || status_name || ' (' || status_id || E')\\1',
      'g'
    )
    WHERE "externalMessageId" LIKE 'order:%:created'
      AND "text" ~ ('Статус: ' || status_id || '($|\n)');
  END LOOP;
END $$;
