import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTopic, setSelectedTopicId } from "@/lib/store";
import { useVoiceProfiles, setDefaultVoiceProfile } from "@/lib/production";

const CATEGORIES = [
  "History",
  "Science",
  "Nature",
  "Technology",
  "Mystery",
  "Biography",
  "Culture",
  "Crime",
  "Space",
  "Other",
];

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Hindi",
  "Arabic",
  "Japanese",
];

const VISUAL_STYLES = [
  "Cinematic",
  "Minimalist",
  "Vintage / Archival",
  "Realistic Photo",
  "Illustrated",
  "3D Render",
];

const selectClass =
  "flex h-10 w-full rounded-xl border border-border bg-background/60 px-3.5 text-sm shadow-soft transition-all duration-200 focus-ring hover:border-brand/30";

export function CreateProjectModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const voiceProfiles = useVoiceProfiles();

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [language, setLanguage] = useState(LANGUAGES[0]);
  const [audience, setAudience] = useState("");
  const [visualStyle, setVisualStyle] = useState("");
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [creating, setCreating] = useState(false);

  function reset() {
    setTitle("");
    setTopic("");
    setCategory(CATEGORIES[0]);
    setLanguage(LANGUAGES[0]);
    setAudience("");
    setVisualStyle("");
    setVoiceProfileId("");
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanTopic = topic.trim();
    if (!cleanTitle || !cleanTopic) {
      toast.error("Add a project title and documentary topic");
      return;
    }
    setCreating(true);
    try {
      // Fresh project ID with a clean slate — no prior stage data is carried over.
      const created = saveTopic({
        universe: "The Hidden Origins of Everyday Life",
        topic: cleanTitle,
        explanation: cleanTopic,
        ctrScore: 0,
        evergreenScore: 0,
        originalityScore: 0,
        researchDifficulty: "Unknown",
        visualDifficulty: "Unknown",
        estimatedLength: "—",
        category,
        language,
        targetAudience: audience.trim() || undefined,
        visualStyle: visualStyle.trim() || undefined,
        voiceProfileId: voiceProfileId || undefined,
      });
      // Make it the one and only active project, then start the workflow.
      setSelectedTopicId(created.id);
      if (voiceProfileId) setDefaultVoiceProfile(voiceProfileId);
      reset();
      onOpenChange(false);
      toast.success("Project created — starting research");
      router.navigate({ to: "/research" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand/12 text-brand">
              <Sparkles className="h-4 w-4" />
            </span>
            Create New Project
          </DialogTitle>
          <DialogDescription>
            Set up your documentary and jump straight into the AI workflow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cp-title">Project Title</Label>
            <Input
              id="cp-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Secret History of Salt"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-topic">Documentary Topic</Label>
            <Textarea
              id="cp-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What is this documentary about? Describe the story you want to tell."
              className="min-h-[80px]"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cp-category">Category</Label>
              <select
                id="cp-category"
                className={selectClass}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cp-language">Language</Label>
              <select
                id="cp-language"
                className={selectClass}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="cp-audience">Target Audience</Label>
            <Input
              id="cp-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. Curious adults who love history & science"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cp-visual">
                Visual Style <span className="text-muted-foreground">(optional)</span>
              </Label>
              <select
                id="cp-visual"
                className={selectClass}
                value={visualStyle}
                onChange={(e) => setVisualStyle(e.target.value)}
              >
                <option value="">Auto / Not set</option>
                {VISUAL_STYLES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cp-voice">
                Voice <span className="text-muted-foreground">(optional)</span>
              </Label>
              <select
                id="cp-voice"
                className={selectClass}
                value={voiceProfileId}
                onChange={(e) => setVoiceProfileId(e.target.value)}
              >
                <option value="">Default voice</option>
                {voiceProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateProjectModal;