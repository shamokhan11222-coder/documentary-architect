import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Sparkles, RefreshCw, Maximize2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/io";

type RefineMode = "improve" | "rewrite" | "expand";

export function EditableCard({
  title,
  value,
  onSave,
  onRefine,
}: {
  title: string;
  value: string;
  onSave: (text: string) => void;
  onRefine: (mode: RefineMode) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState<RefineMode | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  async function refine(mode: RefineMode) {
    setBusy(mode);
    try {
      await onRefine(mode);
      toast.success(`${title} — ${mode} done`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const isList = value.includes("\n");

  return (
    <section className="flex flex-col rounded-lg border border-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex gap-1">
          <IconBtn label="Copy" onClick={() => copyText(value)}>
            <Copy className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            label={editing ? "Done" : "Edit"}
            onClick={() => {
              if (editing) onSave(draft);
              setEditing((v) => !v);
            }}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </IconBtn>
        </div>
      </div>

      {editing ? (
        <textarea
          className="min-h-[120px] w-full resize-y rounded-md border border-input bg-background p-2 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : isList ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {value.split("\n").filter(Boolean).map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{value || "—"}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <ActionBtn label="Improve" mode="improve" busy={busy} onClick={refine} icon={Sparkles} />
        <ActionBtn label="Rewrite" mode="rewrite" busy={busy} onClick={refine} icon={RefreshCw} />
        <ActionBtn label="Expand" mode="expand" busy={busy} onClick={refine} icon={Maximize2} />
      </div>
    </section>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={label} onClick={onClick}>
      {children}
    </Button>
  );
}

function ActionBtn({
  label,
  mode,
  busy,
  onClick,
  icon: Icon,
}: {
  label: string;
  mode: RefineMode;
  busy: RefineMode | null;
  onClick: (m: RefineMode) => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs"
      disabled={busy !== null}
      onClick={() => onClick(mode)}
    >
      {busy === mode ? (
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      ) : (
        <Icon className="mr-1 h-3 w-3" />
      )}
      {label}
    </Button>
  );
}
