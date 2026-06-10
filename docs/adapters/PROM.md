# Prom Adapter (Stub)

Status: stubbed (no real integration yet).

## Auth

- Type: `TOKEN` (planned) or `OAUTH` if required by platform
- Stored in DB: encrypted blob in `ChannelAccount.authDataEncrypted`

## Capabilities (planned)

- List conversations: yes
- List messages: yes
- Send message: yes
- Attachments: yes (S3-compatible storage, short links)
- Webhooks: unknown (TBD)

## Rate limits

TBD (fill after real integration).

## Failure modes

- Auth revoked -> disable account + surface error to user
- Sync errors -> create `OutboxEvent` type `sync.error`

## Mapping

- `ChannelAccount.externalAccountId`: Prom account id
- `Conversation.externalConversationId`: Prom thread id
- `Message.externalMessageId`: Prom message id

