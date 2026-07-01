import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";

import { DNA_SLOTS, useDnaIndex, setDna, clearDna, dnaImageId, type DnaKey } from "@/lib/visual-dna";
import { useImage, fileToDataUrl } from "@/lib/images";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/visual-dna")({
  head: () => ({ meta: [{ title: "Visual DNA — Documentary Studio" }] }),
  component: VisualDnaPage,
});

function VisualDnaPage() {
  const index = useDnaIndex();

  async function upload(key: DnaKey, file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      await setDna(key, dataUrl);
      toast.success("Reference saved");
    } catch {
      toast.error("Could not save that image");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-xl font-semibold">Visual DNA</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload permanent global references. Every project automatically uses these for perfect,
        consistent visuals — no need to re-upload per project.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {DNA_SLOTS.map((slot) => (
          <DnaCard
            key={slot.key}
            slotKey={slot.key}
            label={slot.label}
            set={index.includes(slot.key)}
            onUpload={(f) => upload(slot.key, f)}
          />
        ))}
      </div>
    </div>
  );
}

function DnaCard({
  slotKey,
  label,
  set,
  onUpload,
}: {
  slotKey: DnaKey;
  label: string;
  set: boolean;
  onUpload: (f: File | null) => void;
}) {
  const img = useImage(set ? dnaImageId(slotKey) : null);
  const inputId = `dna-${slotKey}`;
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        {set && (
          <Button size="icon" variant="ghost" onClick={() => clearDna(slotKey)} aria-label="Remove">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-3 flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
        {img ? (
          <img src={img} alt={label} className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">No reference yet</span>
        )}
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onUpload(e.target.files?.[0] ?? null)}
      />
      <label htmlFor={inputId}>
        <Button asChild size="sm" variant="secondary" className="mt-3 w-full">
          <span>
            <Upload className="mr-2 h-4 w-4" /> {set ? "Replace" : "Upload"}
          </span>
        </Button>
      </label>
    </div>
  );
}