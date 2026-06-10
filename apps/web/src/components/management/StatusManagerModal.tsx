import { useState } from 'react';
import { useAppStore } from '@/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Status } from '@/types';

const colorPalette = [
  '0 84% 60%',
  '25 95% 53%',
  '45 93% 47%',
  '142 71% 45%',
  '217 91% 60%',
  '262 83% 58%',
  '330 81% 60%',
  '190 95% 39%',
];

const iconPalette = ['🆕', '⏳', '💳', '🚚', '✅', '❌', '🔄', '📋', '🎯', '⚡', '🔔', '📦', '💬', '🔒', '🏷️', '📊'];

interface StatusManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StatusManagerModal({ open, onOpenChange }: StatusManagerModalProps) {
  const statuses = useAppStore((s) => s.statuses);
  const createStatus = useAppStore((s) => s.createStatus);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const deleteStatus = useAppStore((s) => s.deleteStatus);
  const [editingStatus, setEditingStatus] = useState<Status | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(colorPalette[0]);
  const [newIcon, setNewIcon] = useState(iconPalette[0]);
  const [isCreating, setIsCreating] = useState(false);

  const startCreate = () => {
    setIsCreating(true);
    setEditingStatus(null);
    setNewName('');
    setNewColor(colorPalette[0]);
    setNewIcon(iconPalette[0]);
  };

  const startEdit = (status: Status) => {
    setIsCreating(false);
    setEditingStatus(status);
    setNewName(status.name);
    setNewColor(status.color);
    setNewIcon(status.icon);
  };

  const cancel = () => {
    setIsCreating(false);
    setEditingStatus(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center justify-between">
            Керування статусами
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={startCreate}>
              <Plus className="h-3 w-3 mr-1" /> Новий
            </Button>
          </DialogTitle>
        </DialogHeader>

        {(isCreating || editingStatus) && (
          <div className="border border-border rounded-lg p-3 space-y-3">
            <Input
              placeholder="Назва статусу"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm"
            />
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Колір</p>
              <div className="flex gap-1.5 flex-wrap">
                {colorPalette.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`h-6 w-6 rounded-full transition-all ${newColor === c ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : ''}`}
                    style={{ backgroundColor: `hsl(${c})` }}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Іконка</p>
              <div className="grid grid-cols-8 gap-1">
                {iconPalette.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setNewIcon(icon)}
                    className={`h-7 w-7 flex items-center justify-center rounded text-sm transition-all ${
                      newIcon === icon ? 'bg-accent ring-1 ring-ring' : 'hover:bg-accent'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            {/* Live preview */}
            <div className="flex items-center gap-2 p-2 bg-muted rounded">
              <span>{newIcon}</span>
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `hsl(${newColor} / 0.15)`, color: `hsl(${newColor})` }}
              >
                {newName || 'Попередній перегляд'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={cancel}>
                Скасувати
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                disabled={!newName.trim()}
                onClick={async () => {
                  const payload = { name: newName.trim(), color: newColor, icon: newIcon };
                  if (editingStatus) await updateStatus(editingStatus.id, payload);
                  else await createStatus(payload);
                  cancel();
                }}
              >
                {editingStatus ? 'Зберегти' : 'Створити'}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin">
          {statuses.map((status) => (
            <div
              key={status.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors"
            >
              <span>{status.icon}</span>
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded flex-1"
                style={{ backgroundColor: `hsl(${status.color} / 0.15)`, color: `hsl(${status.color})` }}
              >
                {status.name}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(status)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                onClick={async () => {
                  if (!window.confirm(`Видалити статус "${status.name}"?`)) return;
                  await deleteStatus(status.id);
                  if (editingStatus?.id === status.id) cancel();
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
