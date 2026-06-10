import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useMemo, useState } from "react"
import { Alert, FlatList, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Button, Input, Text } from "@/components/ui"
import { ScreenHeader } from "@/components/ScreenHeader"

import { hsl } from "../lib/date-utils"
import type { RootStackParamList } from "../navigation/types"
import { useAppStore } from "../store"

type Props = NativeStackScreenProps<RootStackParamList, "Tags">

export function TagsScreen({ navigation }: Props) {
  const tags = useAppStore((s) => s.tags)
  const createTag = useAppStore((s) => s.createTag)
  const deleteTag = useAppStore((s) => s.deleteTag)

  const [name, setName] = useState("")
  const [icon, setIcon] = useState("🏷️")
  const [color, setColor] = useState("217 91% 60%")
  const canCreate = name.trim().length > 0 && icon.trim().length > 0 && color.trim().length > 0

  const header = useMemo(() => {
    return (
      <View className="mb-4 gap-2">
        <Text className="text-muted-foreground">Короткі позначки для діалогів (0..N). Long-press: видалити.</Text>

        <View className="flex-row gap-2">
          <Input value={icon} onChangeText={setIcon} placeholder="⭐" className="w-16 text-center" />
          <Input value={name} onChangeText={setName} placeholder="VIP" className="flex-1" />
        </View>

        <View className="flex-row gap-2">
          <Input
            value={color}
            onChangeText={setColor}
            placeholder="217 91% 60%"
            className="flex-1"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            disabled={!canCreate}
            onPress={() => {
              void createTag({ name: name.trim(), color: color.trim(), icon: icon.trim() })
              setName("")
            }}
            className="h-10 px-4"
          >
            <Text>Створити</Text>
          </Button>
        </View>
      </View>
    )
  }, [canCreate, color, createTag, icon, name])

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="bg-background flex-1">
        <ScreenHeader title="Теги" onBack={() => navigation.goBack()} />

        <FlatList
          data={tags}
          keyExtractor={(t) => t.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => (
            <Button
              variant="outline"
              onLongPress={() => {
                Alert.alert("Видалити тег?", item.name, [
                  { text: "Скасувати", style: "cancel" },
                  { text: "Видалити", style: "destructive", onPress: () => void deleteTag(item.id) },
                ])
              }}
              className="bg-background border-border active:bg-muted h-auto flex-row items-center justify-start gap-3 rounded-xl border px-3 py-3"
            >
              <Text className="text-lg">{item.icon}</Text>
              <Text className="text-foreground flex-1 font-semibold">{item.name}</Text>
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hsl(item.color) }} />
            </Button>
          )}
        />
      </View>
    </SafeAreaView>
  )
}
