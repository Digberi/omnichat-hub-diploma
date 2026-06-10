"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { useAppStore } from "@/store"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react"
import { getAccessToken } from "@/lib/tokens"
import type { TemplateCategory, TemplateScope } from "@/types"

const categoryLabels: Record<TemplateCategory, string> = {
  payment: "Оплата",
  delivery: "Доставка",
  upsell: "Допродаж",
  issues: "Проблеми",
  custom: "Кастомні",
}

export default function TemplatesPage() {
  const router = useRouter()
  const token = useMemo(() => getAccessToken(), [])

  const templates = useAppStore((s) => s.templates)
  const createTemplate = useAppStore((s) => s.createTemplate)
  const updateTemplate = useAppStore((s) => s.updateTemplate)
  const deleteTemplate = useAppStore((s) => s.deleteTemplate)
  const [scope, setScope] = useState<TemplateScope>("global")
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | "all">("all")

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftText, setDraftText] = useState("")
  const [draftCategory, setDraftCategory] = useState<TemplateCategory>("custom")

  useEffect(() => {
    if (!token) router.replace("/login?next=/templates")
  }, [router, token])

  const filtered = templates.filter(
    (t) =>
      (scope === "global" ? true : t.scope === scope || t.scope === "global") &&
      (selectedCategory === "all" || t.category === selectedCategory),
  )

  const categories: (TemplateCategory | "all")[] = ["all", "payment", "delivery", "upsell", "issues", "custom"]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/inbox")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold flex-1">Шаблони відповідей</span>
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              setEditorMode("create")
              setEditingId(null)
              setDraftTitle("")
              setDraftText("")
              setDraftCategory(selectedCategory === "all" ? "custom" : selectedCategory)
              setEditorOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Новий
          </Button>
        </div>

        {/* Scope tabs */}
        <Tabs value={scope} onValueChange={(v) => setScope(v as TemplateScope)} className="border-b border-border">
          <TabsList className="bg-transparent w-full justify-start rounded-none h-10 px-3">
            <TabsTrigger
              value="global"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs"
            >
              Global
            </TabsTrigger>
            <TabsTrigger
              value="olx"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-channel-olx data-[state=active]:bg-transparent text-xs"
            >
              OLX
            </TabsTrigger>
            <TabsTrigger
              value="prom"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-channel-prom data-[state=active]:bg-transparent text-xs"
            >
              Prom
            </TabsTrigger>
          </TabsList>
          <TabsContent value={scope} />
        </Tabs>

        {/* Category filter */}
        <div className="flex gap-1 p-3 overflow-x-auto scrollbar-thin">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs shrink-0"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === "all" ? "Усі" : categoryLabels[cat]}
            </Button>
          ))}
        </div>

        {/* Template list */}
        <div className="p-3 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">Немає шаблонів у цій категорії</p>
          ) : (
            filtered.map((tpl) => (
              <div key={tpl.id} className="rounded-lg border border-border p-3 space-y-1.5 bg-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{tpl.title}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {tpl.categoryName || categoryLabels[tpl.category]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        setEditorMode("edit")
                        setEditingId(tpl.id)
                        setDraftTitle(tpl.title)
                        setDraftText(tpl.text)
                        setDraftCategory(tpl.category)
                        setEditorOpen(true)
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={async () => {
                        if (!window.confirm(`Видалити шаблон "${tpl.title}"?`)) return
                        await deleteTemplate(tpl.id)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tpl.text}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{editorMode === "create" ? "Новий шаблон" : "Редагувати шаблон"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Назва</p>
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className="h-8 text-sm" />
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Категорія</p>
              <div className="flex gap-1 flex-wrap">
                {(["payment", "delivery", "upsell", "issues", "custom"] as TemplateCategory[]).map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant={draftCategory === cat ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDraftCategory(cat)}
                  >
                    {categoryLabels[cat]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Текст</p>
              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                className="min-h-[140px] text-xs"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                Скасувати
              </Button>
              <Button
                type="button"
                disabled={!draftTitle.trim() || !draftText.trim()}
                onClick={async () => {
                  const payload = {
                    scope,
                    title: draftTitle.trim(),
                    text: draftText.trim(),
                    category: draftCategory,
                  } as const

                  if (editorMode === "create") {
                    await createTemplate(payload)
                    setEditorOpen(false)
                    return
                  }

                  if (!editingId) return
                  await updateTemplate(editingId, { title: payload.title, text: payload.text, category: payload.category })
                  setEditorOpen(false)
                }}
              >
                Зберегти
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
