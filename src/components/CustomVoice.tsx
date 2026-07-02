import { useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, Upload, Trash2, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fileToDataUrl } from "@/lib/images";
import {
  useVoiceProfiles,
  saveVoiceProfile,
  deleteVoiceProfile,
} from "@/lib/production";
import type { VoiceProfile } from "@/lib/types";

const CONSENT_TEXT = "I confirm I own this voice or have permission to clone it.";

export function CustomVoice({
  activeProfileId,
  onUse,
}: {
  activeProfileId?: string;
  onUse: (id: string | undefined) => void;
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
    const profile: VoiceProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      source: sample.source,
      sampleAudio: sample.url,
      consent: true,
      createdAt: Date.now(),
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
          <div className="text-xs font-medium text-muted-foreground">Saved voice profiles</div>
          {profiles.map((p) => (
            <div
              key={p.id}
              className={[
                "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
                activeProfileId === p.id ? "border-primary bg-primary/5" : "border-border",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {p.source === "record" ? "recorded" : "uploaded"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <audio controls src={p.sampleAudio} className="h-7" />
                <Button
                  size="sm"
                  variant={activeProfileId === p.id ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => onUse(activeProfileId === p.id ? undefined : p.id)}
                >
                  {activeProfileId === p.id ? "In use" : "Use"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    deleteVoiceProfile(p.id);
                    if (activeProfileId === p.id) onUse(undefined);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
