import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, RotateCcw, Download, Check, Eraser, Brush } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fileToDataUrl } from "@/lib/images";
import { RigSvg } from "@/lib/rig/render-svg";
import { defaultRig, DEFAULT_EXPRESSION, type Rig, type Pose, type Expression } from "@/lib/rig/rig-model";
import { POSES, TEST_PANEL_POSES, getPose } from "@/lib/rig/poses";
import { extractTraits } from "@/lib/rig/traits";
import { removeWhiteBackground, brushAlpha } from "@/lib/rig/bg-remove";
import {
  loadReferenceOriginal, loadReferenceProcessed, saveReferenceOriginal, saveReferenceProcessed,
  saveRig, loadRig, isApproved, markApproved, resetRig,
} from "@/lib/rig/storage";
import { downloadBlob, downloadText, svgElToPngBlob, svgToString } from "@/lib/rig/export";

export const Route = createFileRoute("/character-rig-lab")({
  head: () => ({
    meta: [
      { title: "Character Rig Lab — Stickmax Studio" },
      { name: "description", content: "Turn an uploaded stickman reference into a reusable, poseable vector rig." },
    ],
  }),
  component: CharacterRigLab,
});

function CharacterRigLab() {
  const [rig, setRig] = useState<Rig>(() => defaultRig());
  const [original, setOriginal] = useState<string | null>(null);
  const [processed, setProcessed] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(32);
  const [brushMode, setBrushMode] = useState<"erase" | "restore" | null>(null);
  const [brushSize, setBrushSize] = useState(24);
  const [approved, setApproved] = useState<boolean>(false);
  const [livePose, setLivePose] = useState<Pose>(() => getPose("standing"));
  const [poseName, setPoseName] = useState<string>("standing");
  const [expression, setExpression] = useState<Expression>({ ...DEFAULT_EXPRESSION });
  const [scale, setScale] = useState(1);

  // Hydrate from IndexedDB / localStorage on mount.
  useEffect(() => {
    void (async () => {
      const [orig, proc] = await Promise.all([loadReferenceOriginal(), loadReferenceProcessed()]);
      if (orig) setOriginal(orig);
      if (proc) setProcessed(proc);
      setRig(loadRig());
      setApproved(isApproved());
    })();
  }, []);

  // Persist rig changes.
  useEffect(() => { saveRig(rig); }, [rig]);

  // Keep live pose in sync when poseName changes.
  useEffect(() => { setLivePose(getPose(poseName)); }, [poseName]);

  const onUpload = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setOriginal(dataUrl);
      await saveReferenceOriginal(dataUrl);
      const removed = await removeWhiteBackground(dataUrl, { tolerance });
      setProcessed(removed);
      await saveReferenceProcessed(removed);
      const traits = await extractTraits(removed);
      setRig((r) => ({ ...r, traits: { ...r.traits, ...traits } }));
      setApproved(false);
      toast.success("Background removed — adjust and confirm");
    } catch (err) {
      console.error(err);
      toast.error("Could not process image");
    }
  }, [tolerance]);

  const rerunRemoval = useCallback(async () => {
    if (!original) return;
    const removed = await removeWhiteBackground(original, { tolerance });
    setProcessed(removed);
    await saveReferenceProcessed(removed);
  }, [original, tolerance]);

  const onBrush = useCallback(async (evt: React.MouseEvent<HTMLDivElement>) => {
    if (!brushMode || !processed) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const img = new Image();
    img.src = processed;
    await new Promise((r) => { img.onload = r; });
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = (evt.clientX - rect.left) * scaleX;
    const y = (evt.clientY - rect.top) * scaleY;
    const r = brushSize * ((scaleX + scaleY) / 2);
    const next = await brushAlpha(processed, x, y, r, brushMode, original ?? undefined);
    setProcessed(next);
    await saveReferenceProcessed(next);
  }, [brushMode, processed, brushSize, original]);

  const onConfirm = useCallback(async () => {
    if (!processed) return;
    markApproved();
    setApproved(true);
    toast.success("Character confirmed — try the poses");
  }, [processed]);

  const onReset = useCallback(async () => {
    await resetRig();
    setOriginal(null); setProcessed(null); setApproved(false);
    setRig(defaultRig());
    toast.success("Rig reset");
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Character Rig Lab</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a stickman reference. We isolate the character, extract its visual traits, and
          build a reusable poseable vector rig. The bitmap is never re-pasted into scenes.
        </p>
      </header>

      {/* Step 1: Upload + background removal */}
      <section className="rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold">1. Isolate character</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
          <div>
            <div
              className="relative aspect-video overflow-hidden rounded-lg border border-dashed border-border"
              style={{
                backgroundImage:
                  "conic-gradient(#e5e7eb 25%, transparent 0 50%, #e5e7eb 0 75%, transparent 0)",
                backgroundSize: "16px 16px",
                cursor: brushMode ? "crosshair" : "default",
              }}
              onClick={onBrush}
            >
              {processed ? (
                <img src={processed} alt="Processed reference" className="mx-auto h-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Upload a stickman reference to begin
                </div>
              )}
            </div>
          </div>
          <div className="w-full space-y-3 md:w-56">
            <input id="rig-upload" type="file" accept="image/*" className="hidden"
              onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
            <label htmlFor="rig-upload">
              <Button asChild className="w-full"><span><Upload className="mr-2 h-4 w-4" /> Upload reference</span></Button>
            </label>

            <div>
              <label className="text-xs text-muted-foreground">Background tolerance ({tolerance})</label>
              <input type="range" min={0} max={120} value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                onMouseUp={rerunRemoval} onTouchEnd={rerunRemoval}
                className="w-full" />
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant={brushMode === "erase" ? "default" : "outline"}
                onClick={() => setBrushMode(brushMode === "erase" ? null : "erase")}>
                <Eraser className="mr-1 h-3 w-3" /> Erase
              </Button>
              <Button size="sm" variant={brushMode === "restore" ? "default" : "outline"}
                onClick={() => setBrushMode(brushMode === "restore" ? null : "restore")}>
                <Brush className="mr-1 h-3 w-3" /> Restore
              </Button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Brush size ({brushSize}px)</label>
              <input type="range" min={4} max={80} value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))} className="w-full" />
            </div>

            <Button className="w-full" onClick={onConfirm} disabled={!processed}>
              <Check className="mr-2 h-4 w-4" /> {approved ? "Character confirmed" : "Confirm character"}
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={onReset}>
              <RotateCcw className="mr-2 h-3 w-3" /> Reset rig
            </Button>
          </div>
        </div>
      </section>

      {/* Step 2: Six-panel test canvas */}
      <section className="mt-6 rounded-xl border border-border p-5" aria-disabled={!approved}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">2. Same character, six poses</h2>
          {!approved && <span className="text-xs text-muted-foreground">Confirm your character first</span>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="pose-panels">
          {TEST_PANEL_POSES.map((name) => (
            <PosePanel key={name} name={name} rig={rig} expression={expression} />
          ))}
        </div>
      </section>

      {/* Step 3: Live controls */}
      <section className="mt-6 rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold">3. Live controls</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="space-y-3 text-sm">
            <Field label="Pose">
              <select value={poseName} onChange={(e) => setPoseName(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-1">
                {Object.keys(POSES).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Expression">
              <select value={expression.mouthStyle}
                onChange={(e) => setExpression((x) => ({ ...x, mouthStyle: e.target.value as Expression["mouthStyle"] }))}
                className="w-full rounded-md border border-input bg-background px-2 py-1">
                {["line","smile","frown","open","worried"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Facing direction">
              <select value={livePose.facing}
                onChange={(e) => setLivePose((p) => ({ ...p, facing: Number(e.target.value) as 1 | -1 }))}
                className="w-full rounded-md border border-input bg-background px-2 py-1">
                <option value={1}>Right</option>
                <option value={-1}>Left</option>
              </select>
            </Field>
            <Slider label="Left arm angle" value={livePose.lShoulder} min={-120} max={120}
              onChange={(v) => setLivePose((p) => ({ ...p, lShoulder: v }))} />
            <Slider label="Right arm angle" value={livePose.rShoulder} min={-120} max={120}
              onChange={(v) => setLivePose((p) => ({ ...p, rShoulder: v }))} />
            <Slider label="Left leg angle" value={livePose.lHip} min={-100} max={100}
              onChange={(v) => setLivePose((p) => ({ ...p, lHip: v }))} />
            <Slider label="Right leg angle" value={livePose.rHip} min={-100} max={100}
              onChange={(v) => setLivePose((p) => ({ ...p, rHip: v }))} />
            <Slider label="Head tilt" value={livePose.headTilt} min={-45} max={45}
              onChange={(v) => setLivePose((p) => ({ ...p, headTilt: v }))} />
            <Slider label="Scale" value={Math.round(scale * 100)} min={40} max={140}
              onChange={(v) => setScale(v / 100)} />
            <Button variant="outline" size="sm" onClick={() => { setLivePose(getPose(poseName)); setScale(1); setExpression({ ...DEFAULT_EXPRESSION }); }}>
              <RotateCcw className="mr-2 h-3 w-3" /> Reset
            </Button>
          </div>
          <LivePanel rig={rig} pose={livePose} expression={expression} scale={scale} poseName={poseName} />
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Slider({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span><span>{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full" />
    </div>
  );
}

function PosePanel({ name, rig, expression }: { name: string; rig: Rig; expression: Expression }) {
  const pose = useMemo(() => getPose(name), [name]);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const exportPng = async () => {
    if (!svgRef.current) return;
    const blob = await svgElToPngBlob(svgRef.current);
    downloadBlob(blob, `rig-${name}.png`);
  };
  const exportSvg = () => {
    if (!svgRef.current) return;
    downloadText(svgToString(svgRef.current), `rig-${name}.svg`, "image/svg+xml");
  };
  const exportJson = () => {
    downloadText(JSON.stringify({ pose: name, ...pose }, null, 2), `rig-${name}.json`, "application/json");
  };

  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">{name}</div>
      <div className="flex aspect-square items-center justify-center bg-white">
        <SvgHost ref={svgRef} rig={rig} pose={pose} expression={expression} scale={0.85} />
      </div>
      <div className="flex gap-1 border-t border-border px-2 py-2">
        <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={exportPng}><Download className="mr-1 h-3 w-3" /> PNG</Button>
        <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={exportSvg}>SVG</Button>
        <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={exportJson}>JSON</Button>
      </div>
    </div>
  );
}

function LivePanel({ rig, pose, expression, scale, poseName }: {
  rig: Rig; pose: Pose; expression: Expression; scale: number; poseName: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const exportPng = async () => {
    if (!svgRef.current) return;
    const blob = await svgElToPngBlob(svgRef.current);
    downloadBlob(blob, `rig-live-${poseName}.png`);
  };
  return (
    <div className="rounded-lg border border-border bg-white">
      <div className="flex h-[420px] items-center justify-center">
        <SvgHost ref={svgRef} rig={rig} pose={pose} expression={expression} scale={scale} />
      </div>
      <div className="flex gap-2 border-t border-border p-2">
        <Button size="sm" variant="outline" onClick={exportPng}><Download className="mr-1 h-3 w-3" /> Transparent PNG</Button>
      </div>
    </div>
  );
}

const SvgHost = ({ ref, rig, pose, expression, scale }: {
  ref: React.RefObject<SVGSVGElement | null>;
  rig: Rig; pose: Pose; expression: Expression; scale: number;
}) => (
  <svg
    ref={ref}
    viewBox="0 0 200 260"
    className="h-full w-auto"
    xmlns="http://www.w3.org/2000/svg"
  >
    <RigInline rig={rig} pose={pose} expression={expression} scale={scale} />
  </svg>
);

function RigInline(props: { rig: Rig; pose: Pose; expression: Expression; scale: number }) {
  // Delegate to the same renderer but as inline SVG children — we wrap in
  // another <svg> above, and RigSvg would nest an svg-in-svg. Instead we
  // pull its guts by rendering a full RigSvg and letting the browser handle
  // the outer viewBox via the inner one (both share 0 0 200 260, so it's
  // fine visually and export serializes the outer element).
  return <RigSvg {...props} className="h-full w-full" />;
}