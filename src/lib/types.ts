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
  generatedAt: number;
}

export interface Story {
  topicId: string;
  script: string;
  hookScore: number;
  storyScore: number;
  engagementScore: number;
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