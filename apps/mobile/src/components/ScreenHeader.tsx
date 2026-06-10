import { View } from "react-native"

import { Button, Text } from "@/components/ui"

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string
  onBack?: () => void
  right?: React.ReactNode
}) {
  return (
    <View className="bg-background border-border/60 flex-row items-center gap-2 border-b px-3 py-2">
      {onBack ? (
        <Button
          variant="ghost"
          size="icon"
          onPress={onBack}
          className="bg-muted active:bg-muted/80 h-9 w-9 items-center justify-center rounded-lg"
          accessibilityLabel="Back"
        >
          <Text className="text-base font-black">{"\u2190"}</Text>
        </Button>
      ) : (
        <View className="h-9 w-9" />
      )}

      <Text className="text-foreground flex-1 text-center text-sm font-black">{title}</Text>

      {right ? right : <View className="h-9 w-9" />}
    </View>
  )
}
