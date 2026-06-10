import { io, type Socket } from "socket.io-client"

import { env } from "./env"

export function connectSocket(accessToken: string): Socket {
  return io(env.wsUrl, {
    path: env.wsPath,
    transports: ["websocket"],
    auth: { token: accessToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  })
}
