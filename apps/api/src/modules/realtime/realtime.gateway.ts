import { ConfigService } from "@nestjs/config"
import { JwtService } from "@nestjs/jwt"
import { WebSocketGateway, type OnGatewayConnection, type OnGatewayInit } from "@nestjs/websockets"
import type { Server, Socket } from "socket.io"
import { PinoLogger } from "nestjs-pino"

import type { AccessTokenPayload } from "../auth/types/auth.types"
import { PrismaService } from "../prisma/prisma.service"

@WebSocketGateway({
  path: "/ws",
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  afterInit(server: Server) {
    // IMPORTANT:
    // We authenticate and join the workspace room in middleware so by the time the client receives "connect",
    // the socket is already in the correct room. This avoids a race where outbox events are emitted before join().
    server.use((socket, next) => {
      void (async () => {
        const tokenFromAuth = (socket.handshake.auth as any)?.token
        const headerAuth = socket.handshake.headers.authorization
        const token =
          typeof tokenFromAuth === "string" && tokenFromAuth.length > 0
            ? tokenFromAuth
            : typeof headerAuth === "string" && headerAuth.startsWith("Bearer ")
              ? headerAuth.slice("Bearer ".length)
              : null

        if (!token) {
          next(new Error("Unauthorized"))
          return
        }

        try {
          const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
            secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
          })

          const membership = await this.prisma.membership.findFirst({
            where: { userId: payload.sub, workspaceId: payload.wid },
            select: { id: true },
          })
          if (!membership) {
            next(new Error("Forbidden"))
            return
          }

          ;(socket.data as any).userId = payload.sub
          ;(socket.data as any).workspaceId = payload.wid

          const room = `workspace:${payload.wid}`
          await socket.join(room)

          next()
        } catch (err) {
          this.logger.warn({ err }, "socket auth failed")
          next(new Error("Unauthorized"))
        }
      })()
    })
  }

  async handleConnection(socket: Socket) {
    const workspaceId = (socket.data as any)?.workspaceId
    const userId = (socket.data as any)?.userId
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      socket.disconnect(true)
      return
    }

    // Defensive: ensure the room join exists even if middleware is bypassed/misconfigured.
    await socket.join(`workspace:${workspaceId}`)

    // Per-connection trace: lets Loki answer "did the user's browser ever
    // open a WS to us?" without instrumenting the client. The user's HAR
    // showed zero socket.io entries — needed a server-side check to rule
    // out CloudFlare blocking WS upgrades vs an auth/token race.
    this.logger.info(
      { socketId: socket.id, workspaceId, userId, transport: socket.conn.transport.name },
      "socket connected",
    )
    socket.on("disconnect", (reason) => {
      this.logger.info(
        { socketId: socket.id, workspaceId, userId, reason },
        "socket disconnected",
      )
    })
  }
}
