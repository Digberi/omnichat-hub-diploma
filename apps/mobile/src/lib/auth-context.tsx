import { createContext, useContext } from "react"
import type { Socket } from "socket.io-client"

export type AuthTokens = { accessToken: string; refreshToken: string }

export type AuthContextValue = {
  accessToken: string | null
  socket: Socket | null
  setTokens: (tokens: AuthTokens) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("AuthContext is not set")
  return ctx
}

