# OLX Adapter (Stub)

Status: stubbed (no real integration yet).

## Auth

- Type: `OAUTH` (planned)
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

- Token expired -> re-auth flow
- Partial sync -> resume via cursor checkpoint

## Mapping

- `ChannelAccount.externalAccountId`: OLX account id
- `Conversation.externalConversationId`: OLX thread id
- `Message.externalMessageId`: OLX message id

