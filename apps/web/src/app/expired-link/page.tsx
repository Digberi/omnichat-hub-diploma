"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { Copy, FileX, MessageCircle } from "lucide-react"

export default function ExpiredLinkPage() {
  const router = useRouter()

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-6">
      <div className="text-center max-w-sm space-y-4">
        <FileX className="h-16 w-16 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-bold">Файл недоступний</h1>
        <p className="text-sm text-muted-foreground">
          Термін дії посилання закінчився. Попросіть продавця надіслати файл ще раз.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => router.push("/inbox")}>
            <MessageCircle className="h-4 w-4 mr-1" />
            Зв&apos;язатися з продавцем
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText("Файл недоступний. Попросіть продавця надіслати ще раз.")
              toast({ title: "Текст скопійовано" })
            }}
          >
            <Copy className="h-4 w-4 mr-1" />
            Скопіювати текст
          </Button>
        </div>
      </div>
    </div>
  )
}

