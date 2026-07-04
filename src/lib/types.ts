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
  // Senior-strategist enrichment (optional for older saved topics).
  altTitle?: string;
  coreMystery?: string;
  whyClick?: string;
  storyConflict?: string;
  hookAngle?: string;
  visualPotential?: string;
  productionDifficulty?: string;
  recommendation?: string;
  favorite: boolean;
  savedAt: number;
  completed?: boolean;
  archived?: boolean;
  folder?: string;
  // Onboarding metadata captured at project creation.
  category?: string;
  language?: string;
  targetAudience?: string;
  visualStyle?: string;
  voiceProfileId?: string;
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
  altTitle?: string;
  coreMystery?: string;
  whyClick?: string;
  storyConflict?: string;
  hookAngle?: string;
  visualPotential?: string;
  productionDifficulty?: string;
  recommendation?: string;
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
  curiosityScore?: number;
  retentionScore?: number;
  targetLabel?: string;
  minWords?: number;
  maxWords?: number;
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
  voiceName?: string;
  speed: number; // 0.7 - 1.2
  stability: number; // 0 - 1
  emotion: number; // 0 - 1
  pauseStrength: number; // 0 - 1
  pitch: number; // 0 - 1 (relative)
  dictionary: { from: string; to: string }[];
  clonedProfileId?: string; // reference to a saved cloned VoiceProfile
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

// A saved voice profile (uploaded sample or in-app recording). Cloning is only
// permitted after the user confirms ownership/permission (consent).
export type VoiceProfileStatus = "ready" | "processing" | "failed" | "needs-sample";

export interface VoiceProfile {
  id: string;
  name: string;
  source: "upload" | "record";
  sampleAudio?: string; // legacy inline data URL (older profiles)
  sampleAudioId?: string; // IndexedDB key for the sample audio (current)
  consent: boolean;
  createdAt: number;
  updatedAt?: number;
  provider?: string; // provider used when the profile was created
  cloneStatus?: string; // human-readable clone status
  status?: VoiceProfileStatus;
  isDefault?: boolean;
  settings?: VoiceSettings; // voice settings snapshot saved with the profile
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
// ---------------- V7: Intelligence Layer ----------------

// Learn My Style — a single user reaction to any generated item.
export type FeedbackRating = "good" | "favorite" | "bad";

export interface FeedbackEntry {
  id: string;
  kind: string; // "hook" | "story" | "thumbnail" | "title" | "camera" | "background" | "expression" | "pacing" | "storytelling" | ...
  rating: FeedbackRating;
  content: string; // the thing that was rated (short)
  topicId?: string;
  at: number;
}

// Knowledge Base — curated "best of" memory the AI can learn from.
export type KnowledgeKind =
  | "hook"
  | "story"
  | "visualStyle"
  | "thumbnail"
  | "seo"
  | "voice"
  | "instruction"
  | "completedProject"
  | "approvedTopic"
  | "rejectedTopic";

export interface KnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  content: string;
  note?: string;
  topicId?: string;
  at: number;
}

// API Settings — prepared, NOT yet activated.
export type ApiProvider =
  | "OpenAI"
  | "Google Gemini"
  | "Fal.ai"
  | "Replicate"
  | "Recraft"
  | "ElevenLabs"
  | "Custom Provider";

export interface ApiKeyEntry {
  id: string;
  provider: ApiProvider;
  apiKey: string;
  purpose: string;
  modelName: string;
  lastTested?: number;
  testResult?: string;
  at: number;
}

// Story Review (dedicated deep review).
export interface StoryReview {
  weakHook: string;
  slowPacing: string;
  repeatedIdeas: string;
  weakEnding: string;
  centralConflict: string;
  lowCuriosity: string;
  suggestions: string[];
  score: number;
}

// Thumbnail Review.
export interface ThumbnailScored {
  index: number;
  ctr: number;
  emotion: number;
  composition: number;
  readability: number;
  curiosity: number;
  overall: number;
  note: string;
}

export interface ThumbnailReview {
  scored: ThumbnailScored[];
  recommendedIndex: number;
  reason: string;
}

// Image Consistency Review.
export interface SceneIssue {
  sceneNumber: number;
  issues: string[];
  fix: string;
}

export interface ConsistencyReport {
  characterConsistent: boolean;
  colorConsistent: boolean;
  outlineConsistent: boolean;
  backgroundConsistent: boolean;
  orderOk: boolean;
  missingScenes: number[];
  duplicateScenes: number[];
  flagged: SceneIssue[];
  summary: string;
}
