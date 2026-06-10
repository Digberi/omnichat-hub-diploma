import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useCallback, useEffect, useState } from "react"
import { FlatList, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import type { components } from "@omnichat/api-client"

import { Text } from "@/components/ui"
import { ScreenHeader } from "@/components/ScreenHeader"

import { api } from "../lib/api"
import type { RootStackParamList } from "../navigation/types"

type Props = NativeStackScreenProps<RootStackParamList, "Templates">
type TemplateCategoryDto = components["schemas"]["TemplateCategoryDto"]
type TemplateDto = components["schemas"]["TemplateDto"]

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

export function TemplatesScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<TemplateCategoryDto[]>([])
  const [templates, setTemplates] = useState<TemplateDto[]>([])

  const fetchAll = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const [cats, tpls] = await Promise.all([
        api.GET("/v1/templates/categories"),
        api.GET("/v1/templates", { params: { query: { scope: "GLOBAL" } } }),
      ])
      if (cats.error || !cats.data) throw new Error(JSON.stringify(cats.error ?? "no categories"))
      if (tpls.error || !tpls.data) throw new Error(JSON.stringify(tpls.error ?? "no templates"))
      setCategories(cats.data as TemplateCategoryDto[])
      setTemplates(tpls.data as TemplateDto[])
    } catch (e: unknown) {
      setError(errorToMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="bg-background flex-1">
        <ScreenHeader title="Шаблони" onBack={() => navigation.goBack()} />

        <View className="flex-1 gap-3 p-4">
          {error ? <Text className="text-destructive font-semibold">{error}</Text> : null}

          <Text className="text-foreground text-base font-black">Категорії</Text>
          <FlatList
            data={categories}
            refreshing={loading}
            onRefresh={fetchAll}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <View className="border-border/60 border-b py-3">
                <Text className="text-foreground font-semibold">{item.name}</Text>
                <Text className="text-muted-foreground text-xs">sort: {item.sortOrder}</Text>
              </View>
            )}
            ListEmptyComponent={!loading ? <Text className="text-muted-foreground">Немає категорій</Text> : null}
          />

          <Text className="text-foreground mt-4 text-base font-black">Шаблони (GLOBAL)</Text>
          <FlatList
            data={templates}
            refreshing={loading}
            onRefresh={fetchAll}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <View className="border-border/60 border-b py-3">
                <Text className="text-foreground font-semibold">{item.title}</Text>
                <Text className="text-muted-foreground text-xs">{item.scope}</Text>
                <Text className="text-foreground mt-2">{item.content}</Text>
              </View>
            )}
            ListEmptyComponent={!loading ? <Text className="text-muted-foreground">Немає шаблонів</Text> : null}
          />
        </View>
      </View>
    </SafeAreaView>
  )
}

