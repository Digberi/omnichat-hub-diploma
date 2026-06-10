import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import { useMemo, useState } from "react"
import { Alert, FlatList, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"

import { Button, Input, Text } from "@/components/ui"
import { ScreenHeader } from "@/components/ScreenHeader"

import { hsl } from "../lib/date-utils"
import type { RootStackParamList } from "../navigation/types"
import { useAppStore } from "../store"

type Props = NativeStackScreenProps<RootStackParamList, "Statuses">

export function StatusesScreen({ navigation }: Props) {
  const statuses = useAppStore((s) => s.statuses)
  const createStatus = useAppStore((s) => s.createStatus)
  const deleteStatus = useAppStore((s) => s.deleteStatus)

  const [name, setName] = useState("")
  const [icon, setIcon] = useState("✅")
  const [color, setColor] = useState("142 71% 45%")
  const canCreate = name.trim().length > 0 && icon.trim().length > 0 && color.trim().length > 0

  const header = useMemo(() => {
    return (
      <View className="mb-4 gap-2">
        <Text className="text-muted-foreground">Один статус на діалог (0..1). Long-press: видалити.</Text>

        <View className="flex-row gap-2">
          <Input value={icon} onChangeText={setIcon} placeholder="✅" className="w-16 text-center" />
          <Input value={name} onChangeText={setName} placeholder="Завершено" className="flex-1" />
        </View>

        <View className="flex-row gap-2">
          <Input
            value={color}
            onChangeText={setColor}
            placeholder="142 71% 45%"
            className="flex-1"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            disabled={!canCreate}
            onPress={() => {
              void createStatus({ name: name.trim(), color: color.trim(), icon: icon.trim() })
              setName("")
            }}
            className="h-10 px-4"
          >
            <Text>Створити</Text>
          </Button>
        </View>
      </View>
    )
  }, [canCreate, color, createStatus, icon, name])

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View className="bg-background flex-1">
        <ScreenHeader title="Статуси" onBack={() => navigation.goBack()} />

        <FlatList
          data={statuses}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => (
            <Button
              variant="outline"
              onLongPress={() => {
                Alert.alert("Видалити статус?", item.name, [
                  { text: "Скасувати", style: "cancel" },
                  { text: "Видалити", style: "destructive", onPress: () => void deleteStatus(item.id) },
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
