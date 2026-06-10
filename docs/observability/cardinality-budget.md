# Cardinality Budget

Active tracker for OTel attributes/labels. Update on every PR that adds a span attribute or metric label.

Owner of each row: PR author who introduced the field.

## Rules

1. **High-card values** (`user_id`, `conversation_id`, `request_id`) live as **trace attributes ONLY**. Never as metric labels.
2. **Low-card values** (service, route, status, channel_type) may become metric labels.
3. Before adding a metric label, confirm cardinality estimate < 100. If higher, use trace attribute instead.
4. Free Grafana plan limit: 10k active series. We aim to stay under 1k for headroom.

## Trace attributes (no cardinality limit, but contribute to span size)

| Attribute | Set by | Cardinality estimate | Notes |
|---|---|---|---|
| `service.name` | resource | 4 (api/workers/web/mobile) | low — auto-set per service |
| `service.version` | resource | 1 per release | low |
| `deployment.environment` | resource | 2 (production/local) | low |
| `omnichat.user_id` | nest interceptor | high — per active user | trace-only (never metric) |
| `omnichat.request_id` | nest interceptor | very high — per request | trace-only |
| `omnichat.conversation_id` | nest interceptor (route param) | high | trace-only |
| `omnichat.channel_account_id` | nest interceptor (route param) | medium-high | trace-only |
| `omnichat.actor_org_id` | nest interceptor (JWT claim) | medium | trace-only |
| `omnichat.channel_type` | controller metadata `@ChannelScope("olx")` | low (3: olx/prom/rozetka) | trace + may become metric label |
| `http.*` (auto) | http instrumentation | medium-high (per route+method+status) | use `http.route` (templated) NOT `http.url` |
| `db.*` (auto) | prisma instrumentation | medium | OK for traces |

## Metric labels (must be low-card)

(Empty until P4 adds dashboards-as-code with explicit metric definitions.)

| Metric | Labels | Cardinality budget | Owner |
|---|---|---|---|

Reserved for future: when adding metrics, follow this template:
- Metric name: `omnichat_*` namespace
- Labels: `service`, `route` (templated), `status_code`, `channel_type` (only if low-card matters)
- Estimated series = product of label cardinalities. Document estimate in this table.

## Removal log

When an attribute is removed (e.g., field deprecated, label discovered too high-card), document here for future reference.

(empty)

## Audit history

- 2026-05-10: initial document, M3 spec
