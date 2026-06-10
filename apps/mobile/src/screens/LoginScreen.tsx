import { useState } from "react"
import { View } from "react-native"

import type { components } from "@omnichat/api-client"

import { Button, Input, Text } from "@/components/ui"

import { api } from "../lib/api"
import { useAuth } from "../lib/auth-context"

type AuthTokensResponseDto = components["schemas"]["AuthTokensResponseDto"]

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function LoginScreen() {
  const auth = useAuth()

  const [email, setEmail] = useState("demo@omnichat.local")
  const [code, setCode] = useState("000000")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otpStarted, setOtpStarted] = useState(false)

  async function startOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.POST("/v1/auth/start-email-login", { body: { email } })
      if (res.error) throw new Error(JSON.stringify(res.error))
      setOtpStarted(true)
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp() {
    setError(null)
    setLoading(true)
    try {
      const res = await api.POST("/v1/auth/verify-email-login", { body: { email, code } })
      if (res.error || !res.data) throw new Error(JSON.stringify(res.error ?? "no data"))
      const data: AuthTokensResponseDto = res.data
      if (!data.accessToken || !data.refreshToken) throw new Error("Missing tokens in response")

      await auth.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="bg-background flex-1 justify-center gap-3 p-4">
      <Text className="text-foreground text-2xl font-extrabold">Login</Text>
      <Text className="text-muted-foreground">
        Email OTP. For local dev you can run API with NODE_ENV=test and fixed code 000000.
      </Text>

      <Text className="text-foreground font-semibold">Email</Text>
      <Input
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="you@example.com"
        className="bg-background"
      />

      <Button onPress={() => void startOtp()} disabled={loading} className="h-10">
        <Text>{otpStarted ? "Code sent to email" : "Start OTP"}</Text>
      </Button>

      <Text className="text-foreground font-semibold">Code</Text>
      <Input
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="number-pad"
        placeholder="000000"
        className="bg-background"
      />

      <Button onPress={() => void verifyOtp()} disabled={loading || code.trim().length !== 6} className="h-10">
        <Text>Verify & Continue</Text>
      </Button>

      {error ? <Text className="text-destructive font-semibold">{error}</Text> : null}
    </View>
  )
}
