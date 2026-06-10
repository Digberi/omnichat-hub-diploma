-- Ad-hoc grant: lift the default `Workspace.maxOlxAccounts = 1` cap for the
-- VIP user `sych13`. Matched via any Identity whose `providerAccountId` or
-- `email` starts with `sych13` (case-insensitive) — covers Google OAuth subject,
-- email/OTP login, etc. 999 is "effectively unlimited" without changing the
-- column type from Int to nullable.
--
-- Idempotent: if no matching identity exists, the UPDATE is a no-op. Safe to
-- re-apply.
UPDATE "Workspace" w
SET "maxOlxAccounts" = 999
WHERE w."id" IN (
  SELECT DISTINCT m."workspaceId"
  FROM "Membership" m
  JOIN "Identity" i ON i."userId" = m."userId"
  WHERE i."email" ILIKE 'sych13%'
     OR i."providerAccountId" ILIKE 'sych13%'
);
