import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useEffect, useState } from "react"
import { Linking, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { components } from "@omnichat/api-client"

import { Button, Card, CardContent, CardHeader, CardTitle, Text } from "@/components/ui"
import { ScreenHeader } from "@/components/ScreenHeader"

import { api } from "../lib/api"
import type { RootStackParamList } from "../navigation/types"

type Props = NativeStackScreenProps<RootStackParamList, "Context">
type ConversationDetailsDto = components["schemas"]["ConversationDetailsDto"]

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function ContextScreen({ navigation, route }: Props) {
  const conversationId = route.params.conversationId

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<ConversationDetailsDto | null>(null)

  const fetchDetails = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await api.GET("/v1/conversations/{conversationId}", { params: { path: { conversationId } } })
      if (res.error || !res.data) throw new Error(JSON.stringify(res.error ?? "no data"))
      setConversation(res.data as ConversationDetailsDto)
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    void fetchDetails()
  }, [fetchDetails])

  const externalUrl = conversation?.contextExternalUrl ?? null

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="bg-background flex-1">
        <ScreenHeader title="Контекст" onBack={() => navigation.goBack()} />

        <View className="flex-1 gap-3 p-4">
          {error ? <Text className="text-destructive font-semibold">{error}</Text> : null}

          {conversation ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-extrabold">{conversation.contextTitle ?? "—"}</CardTitle>
                <Text className="text-muted-foreground">
                  {conversation.contextPrice != null ? `${conversation.contextPrice}` : "—"} {conversation.contextCurrency ?? ""}
                </Text>
                <Text className="text-muted-foreground">Type: {conversation.contextType ?? "—"}</Text>
              </CardHeader>
              <CardContent className="gap-3">
                <View className="gap-1">
                  <Text className="text-foreground font-black">Покупець</Text>
                  <Text className="text-foreground font-semibold">{conversation.buyerDisplayName}</Text>
                  {conversation.buyerPhone ? <Text className="text-muted-foreground">{conversation.buyerPhone}</Text> : null}
                </View>

                <Button
                  variant="outline"
                  disabled={!externalUrl}
                  onPress={() => {
                    if (!externalUrl) return
                    void Linking.openURL(externalUrl)
                  }}
                >
                  <Text>{externalUrl ? "Відкрити зовнішній контекст" : "Немає зовнішнього посилання"}</Text>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Button disabled={loading} variant="secondary" onPress={() => void fetchDetails()}>
            <Text>{loading ? "Оновлення..." : "Оновити"}</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  )
}

