import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ASSET_CATEGORIES, useAssets, addAsset, removeAsset, assetImageId } from "@/lib/assets";
import { useImage, fileToDataUrl } from "@/lib/images";
import type { AssetCategory, AssetMeta } from "@/lib/types";

export const Route = createFileRoute("/assets")({
  head: () => ({ meta: [{ title: "Assets Library — Stickmax Studio" }] }),
  component: AssetsPage,
});

function AssetsPage() {
  const assets = useAssets();
  const [category, setCategory] = useState<AssetCategory>("Stickman");

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await fileToDataUrl(file);
        const kind = file.type.startsWith("audio")
          ? "audio"
          : file.type.startsWith("image")
            ? "image"
            : "other";
        await addAsset(file.name, category, dataUrl, kind);
      } catch {
        toast.error(`Could not add ${file.name}`);
      }
    }
    toast.success("Assets added");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Assets Library</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanent, reusable assets shared across every project — stickman, expressions, objects, maps, arrows, backgrounds, icons, props, music and SFX.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value as AssetCategory)}
        >
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input id="asset-upload" type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <label htmlFor="asset-upload">
          <Button asChild><span><Upload className="mr-2 h-4 w-4" /> Add to {category}</span></Button>
        </label>
      </div>

      {ASSET_CATEGORIES.map((cat) => {
        const items = assets.filter((a) => a.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="mt-6">
            <h2 className="text-sm font-semibold">{cat} <span className="text-muted-foreground">({items.length})</span></h2>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          </div>
        );
      })}

      {!assets.length && <p className="mt-8 text-sm text-muted-foreground">No assets yet. Add some above.</p>}
    </div>
  );
}

function AssetCard({ asset }: { asset: AssetMeta }) {
  const data = useImage(assetImageId(asset.id));
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex aspect-square items-center justify-center bg-muted/30">
        {asset.kind === "image" && data ? (
          <img src={data} alt={asset.name} className="h-full w-full object-contain" />
        ) : asset.kind === "audio" && data ? (
          <audio controls src={data} className="w-full px-1" />
        ) : (
          <span className="text-xs text-muted-foreground">{asset.kind}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1 p-2">
        <span className="truncate text-xs" title={asset.name}>{asset.name}</span>
        <button onClick={() => removeAsset(asset.id)} className="shrink-0 text-muted-foreground hover:text-foreground">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
