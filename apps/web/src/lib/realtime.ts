import { io } from "socket.io-client"

import { getAccessToken } from "./tokens"

export function createRealtimeSocket() {
  const baseUrl = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4121"
  const path = process.env.NEXT_PUBLIC_WS_PATH ?? "/ws"

  return io(baseUrl, {
    path,
    // `websocket` first (HTTP/1.1 Upgrade via api.omnichat.to → CloudFlare
    // → DO App Platform, all proven working via curl), with `polling`
    // fallback so a WS-blocked network (corporate proxy, CF edge issue,
    // browser HTTP/2 quirk) still gets real-time via HTTP long-poll.
    // The user's HAR had zero WS frames — could've been an intermittent
    // upgrade failure with no recovery path.
    transports: ["websocket", "polling"],
    // Function form is re-evaluated on EVERY (re)connect attempt — so
    // after the connect_error handler refreshes the access token, the
    // next reconnect picks it up automatically. The object form would
    // freeze the stale token at socket creation and keep failing 401
    // forever on idle tabs (until any HTTP call triggered a refresh).
    auth: (cb) => cb({ token: getAccessToken() ?? "" }),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })
}
