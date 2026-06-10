import type { ReactNode } from "react"
import { Modal, View } from "react-native"

import { Button, Text } from "@/components/ui"

export function ModalSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} transparent>
      <View className="flex-1 justify-end">
        <Button
          variant="ghost"
          onPress={onClose}
          accessibilityLabel="Close"
          className="absolute inset-0 rounded-none bg-black/40 active:bg-black/40"
        />
        <View className="bg-background rounded-t-2xl pb-4" style={{ maxHeight: "88%" }}>
          <View className="border-border flex-row items-center justify-between border-b px-3 pt-3 pb-2">
            <Text className="text-foreground text-sm font-black">{title}</Text>
            <Button variant="ghost" size="icon" onPress={onClose} className="bg-muted h-8 w-8 rounded-xl">
              <Text className="text-xs font-black">✕</Text>
            </Button>
          </View>
          <View className="gap-1.5 px-3 pt-2">{children}</View>
        </View>
      </View>
    </Modal>
  )
}
