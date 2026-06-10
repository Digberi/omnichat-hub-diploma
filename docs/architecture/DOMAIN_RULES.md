# Domain Rules

This document describes the canonical conversation state rules implemented in `packages/domain`.

## Unread / needsReply

Meaning:

- `needsReply=true` means the conversation needs a seller reply.
- It becomes `false` ONLY after a successful seller reply.
- Opening a chat / marking as read MUST NOT clear `needsReply`.

UA (коротко):

- "Непрочитане" = "потрібна відповідь".
- Стає `false` тільки після успішної відповіді продавця.

## Snooze

Meaning:

- Snooze is a timed mute.
- It suppresses PUSH notifications for new incoming messages until `snoozedUntil`.
- UI must still show unread badges and activity.

## Archive

Meaning:

- Archived conversations live in a separate folder and are not shown in “All”.
- If a new incoming message arrives in an archived conversation:
  - it auto-unarchives into All
  - it becomes Unread (`needsReply=true`)
- Pinned state does NOT restore after unarchive.
- Tags persist across archive/unarchive.
- Status persists across archive/unarchive.

## Pin

Meaning:

- Pin is only for “general chats” and works ONLY in folder “All”.
- Max pinned in All = 3.
- Pinned conversations NEVER auto-archive.
- To archive a pinned conversation, require explicit confirmation: “Unpin & Archive”.

## Auto-archive

Defaults:

- default `autoArchiveDays=7` (configurable)

Rules:

- applies ONLY when `needsReply=false` AND not pinned
- uses `lastSellerReplyAt` as the reference time

## Status vs Tags

- Status is single (0..1).
- Tags are multi (0..N).
- Tags persist through archive/unarchive.
- Status persists through archive/unarchive.

