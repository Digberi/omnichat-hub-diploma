# Channel Adapter Spec Template

Use this template for new adapters (OLX/Prom/etc). Adapters are intentionally stubbed for now.

## Overview

- Channel:
- Auth type: `OAUTH` | `TOKEN`
- Sync direction: inbound only | outbound only | both

## Capabilities matrix

- List conversations:
- List messages:
- Send message:
- Attachments:
- Webhooks:

## Rate limits (placeholders)

- Requests/min:
- Burst:
- Backoff strategy:

## Idempotency strategy

- Incoming:
  - unique key:
  - dedupe window:
- Outgoing:
  - client message id:
  - retry behavior:

## Failure modes

- Auth expired:
- Message send failed:
- Attachment upload failed:
- Partial sync:

## Data mapping

- External conversation id -> `Conversation.externalConversationId`
- External message id -> `Message.externalMessageId`
- Buyer identity mapping:

## Test plan

- Unit tests:
- Integration tests:
- E2E tests:

