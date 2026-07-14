import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loadRig, isApproved } from "@/lib/rig/storage";
import { SceneSvg, resolveScene } from "@/lib/scene/render-scene";
import { TEST_SCENES } from "@/lib/scene/test-scenes";
import type { SceneSpec } from "@/lib/scene/scene-model";
import { svgElToPngBlob, svgToString, downloadBlob, downloadText } from "@/lib/rig/export";

export const Route = createFileRoute("/scene-composer-lab")({
  head: () => ({
    meta: [
      { title: "Scene Composer Lab — Stickmax Studio" },
      { name: "description", content: "Constraint-based scene composer for the rigged stickman system." },
    ],
  }),
  component: SceneComposerLab,
});

function SceneComposerLab() {
  const rig = useMemo(() => loadRig(), []);
  const approved = isApproved();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Scene Composer Lab</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Constraint-based scene layout using the Phase 5A rig. Not wired to the production image queue.
        </p>
        {!approved && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            No approved rig found — using default stickman. Approve one in{" "}
            <Link to="/character-rig-lab" className="underline">Character Rig Lab</Link> for personalised results.
          </div>
        )}
      </header>
      <div className="space-y-6">
        {TEST_SCENES.map((s) => (
          <ScenePanel key={s.sceneId} scene={s} rig={rig} />
        ))}
      </div>
    </div>
  );
}

function ScenePanel({ scene, rig }: { scene: SceneSpec; rig: ReturnType<typeof loadRig> }) {
  const [showBBox, setShowBBox] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const resolved = useMemo(() => resolveScene(scene, rig), [scene, rig]);

  const exportPng = async (transparent: boolean) => {
    if (!svgRef.current) return;
    const blob = await svgElToPngBlob(svgRef.current, 1440);
    downloadBlob(blob, `${scene.sceneId}${transparent ? "-transparent" : ""}.png`);
  };
  const exportSvg = () => {
    if (!svgRef.current) return;
    downloadText(svgToString(svgRef.current), `${scene.sceneId}.svg`, "image/svg+xml");
  };
  const exportJson = () => downloadText(JSON.stringify(scene, null, 2), `${scene.sceneId}.json`, "application/json");

  return (
    <section className="rounded-xl border border-border p-4" data-scene-id={scene.sceneId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{scene.sceneId}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Toggle checked={showBBox} onChange={setShowBBox}>Bounding boxes</Toggle>
          <Toggle checked={showLayers} onChange={setShowLayers}>Layer order</Toggle>
          <Toggle checked={showJson} onChange={setShowJson}>Show JSON</Toggle>
          <Button size="sm" variant="outline" onClick={exportSvg}>SVG</Button>
          <Button size="sm" variant="outline" onClick={() => exportPng(false)}><Download className="mr-1 h-3 w-3" />PNG</Button>
          <Button size="sm" variant="outline" onClick={() => exportPng(true)}>PNG transparent</Button>
          <Button size="sm" variant="ghost" onClick={exportJson}>JSON</Button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="aspect-video w-full">
            <SceneSvg
              scene={scene}
              rig={rig}
              showBBox={showBBox}
              showLayers={showLayers}
              svgRef={svgRef}
              className="h-full w-full"
            />
          </div>
        </div>
        <aside className="space-y-2 text-xs">
          <div>
            <div className="font-semibold text-foreground">Camera:</div>
            <div className="text-muted-foreground">{scene.camera} · {scene.environment} · {scene.timeOfDay}</div>
          </div>
          <div>
            <div className="font-semibold text-foreground">Resolved positions</div>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-muted-foreground">
              {resolved.characters.map((c, i) => (
                <li key={`c${i}`}>char[{i}] {c.spec.pose} → x={Math.round(c.worldX)}, y={Math.round(c.groundY)}, s={c.scale.toFixed(2)}</li>
              ))}
              {resolved.objects.map((o, i) => (
                <li key={`o${i}`}>{o.spec.type} · z{o.layer} → ({Math.round(o.cx)}, {Math.round(o.cy)})</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-foreground">Warnings</div>
            {resolved.warnings.length === 0 ? (
              <div className="text-emerald-600">None</div>
            ) : (
              <ul className="text-amber-700">
                {resolved.warnings.map((w, i) => (<li key={i}>[{w.severity}] {w.message}</li>))}
              </ul>
            )}
          </div>
        </aside>
      </div>
      {showJson && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-snug">
{JSON.stringify(scene, null, 2)}
        </pre>
      )}
    </section>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}