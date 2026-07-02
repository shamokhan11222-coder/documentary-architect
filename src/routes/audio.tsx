import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Music, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { ProjectPicker, useSelectedProject } from "@/components/ProjectPicker";
import { useStory } from "@/lib/store";
import { useAudioPack, saveAudioPack } from "@/lib/production";
import { suggestAudio } from "@/lib/ai.functions";

export const Route = createFileRoute("/audio")({
  head: () => ({ meta: [{ title: "Music & SFX — Stickmax Studio" }] }),
  component: AudioPage,
});

function AudioPage() {
  const { selected } = useSelectedProject();
  const story = useStory(selected?.id ?? null);
  const pack = useAudioPack(selected?.id ?? null);
  const suggest = useServerFn(suggestAudio);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = (await suggest({ data: { topic: selected.topic, script: story?.script } })) as {
        music: { mood: string; placement: string; reason: string }[];
        sfx: { effect: string; placement: string }[];
      };
      saveAudioPack({ topicId: selected.id, music: r.music, sfx: r.sfx, generatedAt: Date.now() });
      toast.success("Audio suggestions ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Music & SFX</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Background music moods and sound effect placement suggestions. No audio is generated — placement only.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ProjectPicker />
        <Button onClick={run} disabled={!selected || busy}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {pack ? "Regenerate" : "Suggest Audio"}
        </Button>
      </div>

      {pack && (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Music className="h-4 w-4" /> Background Music</div>
            <div className="mt-2 space-y-2">
              {pack.music.map((m, i) => (
                <div key={i} className="rounded-lg border border-border p-3 text-sm">
                  <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{m.mood}</span>
                  <div className="mt-1 font-medium">{m.placement}</div>
                  <div className="text-xs text-muted-foreground">{m.reason}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium"><Volume2 className="h-4 w-4" /> Sound Effects</div>
            <div className="mt-2 space-y-2">
              {pack.sfx.map((s, i) => (
                <div key={i} className="rounded-lg border border-border p-3 text-sm">
                  <span className="font-medium">{s.effect}</span>
                  <div className="text-xs text-muted-foreground">{s.placement}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
