import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Upload, Trash2, Check, Star, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fileToDataUrl } from "@/lib/images";
import {
  useVoiceProfiles,
  saveVoiceProfile,
  deleteVoiceProfile,
  renameVoiceProfile,
  setDefaultVoiceProfile,
} from "@/lib/production";
import { getActiveProvider } from "@/lib/provider";
import type { VoiceProfile, VoiceSettings } from "@/lib/types";

const CONSENT_TEXT = "I confirm I own this voice or have permission to clone it.";

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-green-500/15 text-green-600 dark:text-green-400",
  processing: "bg-amber-500/15 text-amber-600",
  failed: "bg-red-500/15 text-red-600",
  "needs-sample": "bg-muted text-muted-foreground",
};

export function CustomVoice({
  activeProfileId,
  onUse,
  currentSettings,
}: {
  activeProfileId?: string;
  onUse: (id: string | undefined) => void;
  currentSettings?: VoiceSettings;
}) {
  const profiles = useVoiceProfiles();
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [sample, setSample] = useState<{ url: string; source: "upload" | "record" } | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function handleUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      toast.error("Please choose an audio file");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      setSample({ url, source: "upload" });
      toast.success("Voice sample loaded");
    } catch {
      toast.error("Could not read that file");
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          setSample({ url: reader.result as string, source: "record" });
          toast.success("Recording captured");
        };
        reader.readAsDataURL(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function save() {
    if (!sample) {
      toast.error("Upload or record a voice sample first");
      return;
    }
    if (!name.trim()) {
      toast.error("Give the voice a name");
      return;
    }
    if (!consent) {
      toast.error("You must confirm you have permission to clone this voice");
      return;
    }
    const provider = getActiveProvider()?.name ?? "Built-in AI";
    const profile: VoiceProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      source: sample.source,
      sampleAudio: sample.url,
      consent: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      provider,
      cloneStatus: "cloned",
      status: "ready",
      isDefault: profiles.length === 0, // first saved profile becomes default
      settings: currentSettings,
    };
    saveVoiceProfile(profile);
    onUse(profile.id);
    setName("");
    setConsent(false);
    setSample(null);
    toast.success("Voice profile saved");
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="text-sm font-medium">Custom / Cloned Voice</div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Upload a sample or record one in the app, then save it as a reusable voice profile.
        Cloning is only allowed once you confirm you have permission.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          id="voice-sample-upload"
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
        />
        <label htmlFor="voice-sample-upload">
          <Button asChild size="sm" variant="secondary">
            <span><Upload className="mr-1 h-3.5 w-3.5" /> Upload Voice Sample</span>
          </Button>
        </label>
        {!recording ? (
          <Button size="sm" variant="secondary" onClick={startRecording}>
            <Mic className="mr-1 h-3.5 w-3.5" /> Record Voice
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={stopRecording}>
            <Square className="mr-1 h-3.5 w-3.5" /> Stop Recording
          </Button>
        )}
        {sample && <audio controls src={sample.url} className="h-8" />}
      </div>

      {sample && (
        <div className="mt-3 space-y-2">
          <input
            className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm"
            placeholder="Voice name (e.g. My Narrator)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{CONSENT_TEXT}</span>
          </label>
          <Button size="sm" onClick={save} disabled={!consent}>
            <Check className="mr-1 h-3.5 w-3.5" /> Save Voice Profile
          </Button>
        </div>
      )}

      {profiles.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Voice Library</div>
          {profiles.map((p) => {
            const status = p.status ?? (p.sampleAudio ? "ready" : "needs-sample");
            return (
              <div
                key={p.id}
                className={[
                  "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
                  activeProfileId === p.id ? "border-primary bg-primary/5" : "border-border",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.isDefault && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Default
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES["needs-sample"]}`}
                  >
                    {status === "needs-sample" ? "Needs sample" : status[0].toUpperCase() + status.slice(1)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.source === "record" ? "recorded" : "uploaded"}
                    {p.provider ? ` · ${p.provider}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Play sample */}
                  <audio controls src={p.sampleAudio} className="h-7" />
                  {/* Use Voice */}
                  <Button
                    size="sm"
                    variant={activeProfileId === p.id ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => onUse(activeProfileId === p.id ? undefined : p.id)}
                  >
                    {activeProfileId === p.id ? "In use" : "Use Voice"}
                  </Button>
                  {/* Set as Default */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Set as default"
                    onClick={() => {
                      setDefaultVoiceProfile(p.id);
                      toast.success(`"${p.name}" is now the default voice`);
                    }}
                  >
                    <Star className={`h-3.5 w-3.5 ${p.isDefault ? "fill-primary text-primary" : ""}`} />
                  </Button>
                  {/* Rename */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Rename"
                    onClick={() => {
                      const next = window.prompt("Rename voice profile", p.name);
                      if (next && next.trim()) {
                        renameVoiceProfile(p.id, next);
                        toast.success("Voice profile renamed");
                      }
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {/* Delete */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Delete"
                    onClick={() => {
                      deleteVoiceProfile(p.id);
                      if (activeProfileId === p.id) onUse(undefined);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
