export interface Topic {
  id: string;
  universe: string;
  topic: string;
  explanation: string;
  ctrScore: number;
  evergreenScore: number;
  originalityScore: number;
  researchDifficulty: string;
  visualDifficulty: string;
  estimatedLength: string;
  favorite: boolean;
  savedAt: number;
  completed?: boolean;
}

// A shared self-review verdict attached to a stage's output.
export interface StageReview {
  score: number;
  issues: string[];
  verdict: string;
}

export interface GeneratedIdea {
  topic: string;
  explanation: string;
  ctrScore: number;
  evergreenScore: number;
  originalityScore: number;
  researchDifficulty: string;
  visualDifficulty: string;
  estimatedLength: string;
}

export interface IdeaCategory {
  category: string;
  ideas: GeneratedIdea[];
}

export interface TasteMemory {
  liked: string[];
  rejected: string[];
  completed: string[];
  highRated: string[];
}

export interface Research {
  topicId: string;
  mainConflict: string;
  timeline: string[];
  historicalFacts: string[];
  scientificFacts: string[];
  interestingFacts: string[];
  commonMyths: string[];
  storyAngles: string[];
  unexpectedTwists: string[];
  importantPeople: string[];
  importantDates: string[];
  sources: string[];
  keyTakeaways: string[];
  bestAngle: string;
  endingIdea: string;
  review?: StageReview;
  generatedAt: number;
}

export interface StorySection {
  key: string;
  title: string;
  content: string;
}

export interface Story {
  topicId: string;
  sections: StorySection[];
  script: string;
  hookScore: number;
  storyScore: number;
  engagementScore: number;
  review?: StageReview;
  generatedAt: number;
}

export type SceneType =
  | "character"
  | "object"
  | "nature"
  | "timeline"
  | "infographic"
  | "abstract concept";

export interface VisualScene {
  sceneNumber: number;
  voiceoverLine: string;
  visualDescription: string;
  mainSubject: string;
  background: string;
  cameraShot: string;
  emotion: string;
  objectsNeeded: string[];
  sceneType: SceneType;
  visualDifficulty: string;
  notes: string;
}

export interface VisualMap {
  topicId: string;
  scenes: VisualScene[];
  generatedAt: number;
}

export interface PromptItem {
  sceneNumber: number;
  voiceoverLine: string;
  imagePrompt: string;
  negativePrompt: string;
  styleNotes: string;
  consistencyNotes: string;
}

export interface PromptPack {
  topicId: string;
  prompts: PromptItem[];
  generatedAt: number;
}

export interface ThumbnailIdea {
  thumbnailTitle: string;
  mainVisualConcept: string;
  mainSubject: string;
  background: string;
  emotion: string;
  textOnThumbnail: string;
  composition: string;
  ctrScore: number;
  whyItWorks: string;
  imagePrompt: string;
  negativePrompt: string;
  chosen?: boolean;
}

export interface ThumbnailPack {
  topicId: string;
  ideas: ThumbnailIdea[];
  generatedAt: number;
}

export interface Seo {
  topicId: string;
  titleOptions: string[];
  bestTitle: string;
  description: string;
  tags: string[];
  hashtags: string[];
  keywords: string[];
  pinnedComment: string;
  shortSummary: string;
  longSummary: string;
  uploadChecklist: string[];
  generatedAt: number;
}

export type Recommendation = "Ready" | "Needs Rewrite" | "Weak Topic";

export interface RatingReport {
  topicId: string;
  hookScore: number;
  storyScore: number;
  retentionScore: number;
  visualClarityScore: number;
  thumbnailCtrScore: number;
  originalityScore: number;
  evergreenScore: number;
  overallScore: number;
  ctrPrediction: string;
  retentionPrediction: string;
  weakestPart: string;
  bestPart: string;
  weakPoints: string[];
  strongPoints: string[];
  whatToImprove: string[];
  recommendation: Recommendation;
  generatedAt: number;
}

// ---------------- V6: Production Studio ----------------

export type NarratorProfile =
  | "deep"
  | "calm"
  | "storyteller"
  | "educational"
  | "cinematic";

export interface VoiceSettings {
  profile: NarratorProfile;
  speed: number; // 0.7 - 1.2
  stability: number; // 0 - 1
  emotion: number; // 0 - 1
  pauseStrength: number; // 0 - 1
  pitch: number; // 0 - 1 (relative)
  dictionary: { from: string; to: string }[];
}

export interface VoiceBlock {
  index: number;
  text: string;
  estSeconds: number;
  realSeconds?: number;
  generatedAt?: number;
}

export interface VoiceProject {
  topicId: string;
  settings: VoiceSettings;
  blocks: VoiceBlock[];
  generatedAt: number;
}

export interface Subtitle {
  index: number;
  start: number; // seconds
  end: number; // seconds
  duration: number; // seconds
  text: string;
}

export interface SubtitlePack {
  topicId: string;
  cues: Subtitle[];
  generatedAt: number;
}

export type QueueStatus = "pending" | "generating" | "completed" | "failed";

export interface QueueItem {
  sceneNumber: number;
  status: QueueStatus;
  error?: string;
}

export interface ProjectQueue {
  topicId: string;
  items: QueueItem[];
  cursor: number; // last scene index reached (for resume)
  updatedAt: number;
}

export type AssetCategory =
  | "Stickman"
  | "Expressions"
  | "Objects"
  | "Maps"
  | "Arrows"
  | "Backgrounds"
  | "Icons"
  | "Props"
  | "Music"
  | "Sound Effects";

export interface AssetMeta {
  id: string;
  name: string;
  category: AssetCategory;
  kind: "image" | "audio" | "other";
  addedAt: number;
}

export interface MusicCue {
  mood: string;
  placement: string;
  reason: string;
}

export interface SfxCue {
  effect: string;
  placement: string;
}

export interface AudioPack {
  topicId: string;
  music: MusicCue[];
  sfx: SfxCue[];
  generatedAt: number;
}