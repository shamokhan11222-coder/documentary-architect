import { createServerFn } from "@tanstack/react-start";
import { callAiJson, callAiText } from "./ai-gateway.server";
import { EXPERTS } from "./experts";
import type {
  IdeaCategory,
  PromptItem,
  RatingReport,
  Research,
  Seo,
  StageReview,
  ThumbnailIdea,
  VisualScene,
} from "./types";
import type { MusicCue, SfxCue } from "./types";

// ---------------- Self-review helper ----------------

async function reviewStage(
  stageName: string,
  content: string,
): Promise<StageReview> {
  try {
    const user = `Review this ${stageName} output for a YouTube documentary. Be ruthless but fair.

Return a JSON object:
{ "score": number (1-10), "issues": ["concrete problems"], "verdict": "one-line verdict" }

OUTPUT:
${content.slice(0, 8000)}`;
    return await callAiJson<StageReview>(EXPERTS.reviewer, user);
  } catch {
    return { score: 7, issues: [], verdict: "Review unavailable." };
  }
}

const CATEGORIES = [
  "Today's Best Documentary Ideas",
  "Trending Evergreen Ideas",
  "Hidden Gems",
  "Highest CTR Ideas",
  "Most Original Ideas",
  "Fast Production Ideas",
  "Easy Visual Ideas",
  "Long Documentary Ideas",
  "Mini Documentary Ideas",
];

// ---------------- Home Idea Feed ----------------

export const generateHomeIdeas = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { liked?: string[]; rejected?: string[]; completed?: string[]; perCategory?: number }) => data ?? {},
  )
  .handler(async ({ data }) => {
    const taste = `EDITOR TASTE PROFILE (learn from this):
Liked topics: ${(data.liked ?? []).slice(0, 40).join("; ") || "none yet"}
Completed topics: ${(data.completed ?? []).slice(0, 40).join("; ") || "none yet"}
REJECTED topics — NEVER propose anything similar in subject, angle, or vibe: ${(data.rejected ?? []).slice(0, 60).join("; ") || "none yet"}`;
    const per = data.perCategory ?? 4;
    const user = `${taste}

Generate a fresh feed of documentary ideas grouped into these EXACT categories:
${CATEGORIES.map((c) => `- ${c}`).join("\n")}

Give ${per} distinct ideas per category. Lean toward the liked/completed style; avoid anything resembling the rejected list. Vary universes/themes widely.

Return a JSON object:
{
  "categories": [
    {
      "category": "exact category name from the list above",
      "ideas": [
        {
          "topic": "punchy documentary title",
          "explanation": "1-2 sentence angle",
          "ctrScore": number (1-10),
          "evergreenScore": number (1-10),
          "originalityScore": number (1-10),
          "researchDifficulty": "Low | Medium | High",
          "visualDifficulty": "Low | Medium | High",
          "estimatedLength": "e.g. '12-18 min'"
        }
      ]
    }
  ]
}`;
    const result = await callAiJson<{ categories: IdeaCategory[] }>(EXPERTS.topic, user);
    return (result.categories ?? []) as IdeaCategory[];
  });

interface GeneratedTopic {
  topic: string;
  explanation: string;
  ctrScore: number;
  evergreenScore: number;
  originalityScore: number;
  researchDifficulty: string;
  visualDifficulty: string;
  estimatedLength: string;
}

interface ResearchData {
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
}

// ---------------- Topic Engine ----------------

export const generateTopics = createServerFn({ method: "POST" })
  .inputValidator((data: { universe: string; count?: number }) => {
    if (!data?.universe?.trim()) throw new Error("Universe is required");
    return { universe: data.universe.trim(), count: data.count ?? 8 };
  })
  .handler(async ({ data }) => {
    const system = `You are a world-class YouTube documentary strategist. You generate high-quality, highly clickable yet substantive documentary video ideas. Think about retention, curiosity, and originality. Avoid generic or overdone topics. Return ONLY valid JSON.`;
    const user = `Universe / theme: "${data.universe}"

Generate ${data.count} distinct documentary video ideas within this universe.

Return a JSON object with this exact shape:
{
  "topics": [
    {
      "topic": "string - punchy documentary title",
      "explanation": "string - 1-2 sentence explanation of the angle",
      "ctrScore": number (1-10),
      "evergreenScore": number (1-10),
      "originalityScore": number (1-10),
      "researchDifficulty": "Low | Medium | High",
      "visualDifficulty": "Low | Medium | High",
      "estimatedLength": "string e.g. '12-18 min'"
    }
  ]
}`;
    const result = await callAiJson<{ topics: GeneratedTopic[] }>(system, user);
    return (result.topics ?? []) as GeneratedTopic[];
  });

// ---------------- Research Engine ----------------

export const researchTopic = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; explanation?: string }) => {
    if (!data?.topic?.trim()) throw new Error("Topic is required");
    return { topic: data.topic.trim(), explanation: data.explanation ?? "" };
  })
  .handler(async ({ data }) => {
    const system = `${EXPERTS.research} Return ONLY valid JSON.`;
    const user = `Documentary topic: "${data.topic}"
${data.explanation ? `Angle: ${data.explanation}` : ""}

Perform deep documentary research. Be specific and concrete (real names, real dates, real facts). Return a JSON object with this exact shape (arrays of concise strings):
{
  "mainConflict": "string - the single central conflict/tension of the story",
  "timeline": ["chronological beats"],
  "historicalFacts": ["..."],
  "scientificFacts": ["..."],
  "interestingFacts": ["..."],
  "commonMyths": ["myths people wrongly believe, each with the correction"],
  "storyAngles": ["distinct narrative angles you could take"],
  "unexpectedTwists": ["surprising reveals to place mid-video"],
  "importantPeople": ["Name — why they matter"],
  "importantDates": ["Date — what happened"],
  "sources": ["credible source types / references to pursue"],
  "keyTakeaways": ["the core things the viewer should remember"],
  "bestAngle": "string - the single strongest narrative angle to build the documentary on",
  "endingIdea": "string - a memorable, resonant way to end the documentary"
}`;
    const research = await callAiJson<ResearchData>(system, user);
    const review = await reviewStage("documentary research", JSON.stringify(research));
    if (review.score < 6) {
      const retry = await callAiJson<ResearchData>(
        system,
        `${user}\n\nA reviewer flagged issues: ${review.issues.join("; ")}. Produce a stronger, more specific version.`,
      );
      return { ...retry, review: await reviewStage("documentary research", JSON.stringify(retry)) };
    }
    return { ...research, review };
  });

// Card-level refinement for the research engine (Improve / Rewrite / Expand).
export const refineCard = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { topic: string; cardTitle: string; content: string; mode: "improve" | "rewrite" | "expand" }) => {
      if (!data?.content?.trim()) throw new Error("Content is required");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const instruction =
      data.mode === "improve"
        ? "Improve this: sharpen accuracy, specificity, and clarity while keeping the same length."
        : data.mode === "rewrite"
          ? "Rewrite this from a fresh angle while covering the same ground."
          : "Expand this with more specific, verified detail and additional strong entries.";
    const user = `Documentary: "${data.topic}"
Research card: "${data.cardTitle}"

${instruction}
If the content is a bulleted list (one item per line), return the same format (one item per line, no numbering, no bullets characters). If it is a paragraph, return a paragraph. Return PLAIN TEXT only, no preamble.

CURRENT CONTENT:
${data.content}`;
    return { content: await callAiText(EXPERTS.research, user) };
  });

// ---------------- Story Engine ----------------

const STORY_RULES = `Storytelling rules you MUST follow:
- Strong opening that hits within the first sentence
- Immediate curiosity / an open loop
- ONE central conflict driving the whole piece
- Logical progression, smooth transitions between beats
- No filler, every section reveals something new
- End with a memorable, resonant conclusion`;

function buildResearchContext(r: Research | undefined): string {
  if (!r) return "";
  const j = (a?: string[]) => (a && a.length ? a.join("; ") : "n/a");
  return `RESEARCH CONTEXT:
Main Conflict: ${r.mainConflict}
Timeline: ${j(r.timeline)}
Historical Facts: ${j(r.historicalFacts)}
Scientific Facts: ${j(r.scientificFacts)}
Interesting Facts: ${j(r.interestingFacts)}
Common Myths: ${j(r.commonMyths)}
Story Angles: ${j(r.storyAngles)}
Unexpected Twists: ${j(r.unexpectedTwists)}
Important People: ${j(r.importantPeople)}
Important Dates: ${j(r.importantDates)}
Key Takeaways: ${j(r.keyTakeaways)}`;
}

export const generateStory = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; research?: Research; minWords?: number; maxWords?: number; targetLabel?: string }) => {
    if (!data?.topic?.trim()) throw new Error("Topic is required");
    return data;
  })
  .handler(async ({ data }) => {
    const minWords = data.minWords ?? 1300;
    const maxWords = data.maxWords ?? 1700;
    const targetLabel = data.targetLabel ?? "9–11 minutes";
    const system = `${EXPERTS.story} ${STORY_RULES}
Return ONLY valid JSON.`;
    const user = `Write a full documentary narration script for: "${data.topic}"

TARGET LENGTH: ${targetLabel} of finished video.
REQUIRED WORD COUNT: between ${minWords} and ${maxWords} words of spoken narration (excluding section titles). This is a hard requirement — do NOT produce a shorter script. Expand each section with real substance (never filler) until the total lands inside this range. A ${targetLabel} video must NOT be a 3–4 minute script.

${buildResearchContext(data.research)}

Write the narration as SEPARATE sections. Never merge them into one giant block.
Use enough sections (and enough depth per section) to naturally reach ${minWords}–${maxWords} words.

Return a JSON object:
{
  "sections": [
    { "key": "hook", "title": "Hook", "content": "..." },
    { "key": "intro", "title": "Intro", "content": "..." },
    { "key": "part1", "title": "Part 1", "content": "..." },
    { "key": "part2", "title": "Part 2", "content": "..." },
    { "key": "part3", "title": "Part 3", "content": "..." },
    { "key": "part4", "title": "Part 4", "content": "..." },
    { "key": "ending", "title": "Ending", "content": "..." }
  ],
  "hookScore": number (1-10),
  "storyScore": number (1-10),
  "engagementScore": number (1-10),
  "curiosityScore": number (1-10),
  "retentionScore": number (1-10)
}`;
    type StoryGen = {
      sections: { key: string; title: string; content: string }[];
      hookScore: number;
      storyScore: number;
      engagementScore: number;
      curiosityScore: number;
      retentionScore: number;
    };
    const gen = await callAiJson<StoryGen>(system, user);
    const script = (gen.sections ?? [])
      .map((s) => `## ${s.title}\n${s.content}`)
      .join("\n\n");
    const review = await reviewStage("documentary script", script);
    return { ...gen, script, review, targetLabel, minWords, maxWords };
  });

// Section-level rewriting with a chosen creative direction.
export type SectionMode =
  | "rewrite"
  | "shorter"
  | "longer"
  | "emotional"
  | "cinematic"
  | "curiosity";

export const rewriteSection = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { topic: string; sectionTitle: string; content: string; mode: SectionMode }) => {
      if (!data?.content?.trim()) throw new Error("Section content is required");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const map: Record<SectionMode, string> = {
      rewrite: "Rewrite this section to be stronger while keeping its purpose and length.",
      shorter: "Make this section noticeably shorter and tighter without losing the key idea.",
      longer: "Expand this section with more depth and detail while staying on point.",
      emotional: "Rewrite this section to be more emotional and human.",
      cinematic: "Rewrite this section to be more cinematic and vivid.",
      curiosity: "Rewrite this section to open stronger curiosity gaps and pull the viewer forward.",
    };
    const user = `Documentary: "${data.topic}"
Section: "${data.sectionTitle}"

${map[data.mode]} ${STORY_RULES}
Return PLAIN TEXT only (just the new section content, no title, no preamble).

CURRENT SECTION:
${data.content}`;
    return { content: await callAiText(EXPERTS.story, user) };
  });

// ---------------- Visual Engine ----------------

const VISUAL_RULES = `${EXPERTS.visual}
PERMANENT VISUAL RULES (never break these):
- ONE SENTENCE = ONE IMAGE. Every sentence of narration becomes at least one scene.
- If a sentence contains multiple visual ideas, SPLIT it into 2 images.
- If a sentence has three distinct visual ideas, split into 3 images.
- NEVER combine too many ideas into one image. One clear idea per scene.
- Every voiceover line must have a matching visual that fits it EXACTLY.
- A character should appear only when needed.
- If the line is about an object, show only that object.
- If the line is about a concept, create a simple visual metaphor.
- Avoid repeated boring backgrounds — vary them.
- Each scene must be understandable in 1 second.
- Do NOT summarize or compress the script. Cover the whole script sentence by sentence.
Return ONLY valid JSON.`;

const SCENE_SHAPE = `{
  "sceneNumber": number,
  "voiceoverLine": "string - exact narration line this visual matches",
  "visualDescription": "string - what is shown, one clear idea",
  "mainSubject": "string",
  "background": "string - simple background",
  "cameraShot": "string e.g. close-up, wide shot, top-down",
  "emotion": "string",
  "objectsNeeded": ["string"],
  "sceneType": "character | object | nature | timeline | infographic | abstract concept",
  "visualDifficulty": "Low | Medium | High",
  "notes": "string"
}`;

export const generateVisualMap = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script: string; minScenes?: number; maxScenes?: number; visualInstructions?: string }) => {
    if (!data?.script?.trim()) throw new Error("Script is required");
    return data;
  })
  .handler(async ({ data }) => {
    const minScenes = data.minScenes ?? 120;
    const maxScenes = data.maxScenes ?? 180;
    const styleBlock = data.visualInstructions?.trim()
      ? `\nPERMANENT VISUAL INSTRUCTIONS (always obey, applied to every scene):\n${data.visualInstructions.trim()}\n`
      : "";
    const user = `Documentary: "${data.topic}"${styleBlock}

Break the following script into a sequential visual beat map, going SENTENCE BY SENTENCE.

SCENE COUNT REQUIREMENT: produce between ${minScenes} and ${maxScenes} scenes. This is a hard requirement — a long script must NOT be compressed into a few dozen images. Apply the one-sentence-one-image rule (splitting multi-idea sentences into 2–3 images) until you reach this range.
Number scenes sequentially starting at 1 with no gaps, jumps, or duplicates.

Return a JSON object:
{ "scenes": [ ${SCENE_SHAPE} ] }

SCRIPT:
${data.script}`;
    const result = await callAiJson<{ scenes: VisualScene[] }>(VISUAL_RULES, user);
    const scenes = (result.scenes ?? []) as VisualScene[];
    // Guarantee clean sequential numbering (001, 002, 003 …) — no gaps,
    // no jumps, no duplicates — regardless of what the model returned.
    return scenes.map((s, i) => ({ ...s, sceneNumber: i + 1 }));
  });

export const regenerateScene = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; scene: VisualScene; visualInstructions?: string }) => {
    if (!data?.scene) throw new Error("Scene is required");
    return data;
  })
  .handler(async ({ data }) => {
    const styleBlock = data.visualInstructions?.trim()
      ? `\nPERMANENT VISUAL INSTRUCTIONS (always obey):\n${data.visualInstructions.trim()}\n`
      : "";
    const user = `Documentary: "${data.topic}"${styleBlock}

Regenerate a single, better visual beat for the SAME voiceover line. Keep the same sceneNumber. Keep it one clear idea.

Return a JSON object with this exact shape: ${SCENE_SHAPE}

CURRENT SCENE:
${JSON.stringify(data.scene)}`;
    return await callAiJson<VisualScene>(VISUAL_RULES, user);
  });

// ---------------- Prompt Engine ----------------

const STYLE_LOCK = `GLOBAL STYLE LOCK (must appear in every prompt):
Simple MS Paint educational documentary style, flat colors, thick slightly rough black outlines, simple shapes, clean composition. No gradients, no shadows, no 3D, no realism, no cinematic lighting, no detailed textures, no text, no captions, no watermark, no frame.

CHARACTER STYLE LOCK (only when a character is shown):
Simple bald stickman, round white head, thick black outline, dot eyes, simple mouth, thin black line body, no hair, no clothes unless needed, no shine on face, no grey face highlights.`;

const PROMPT_RULES = `${EXPERTS.prompt}
You convert one visual scene into one image-generation prompt.
RULES:
- Each prompt must be short and direct.
- One prompt = one image. No multiple concepts.
- Mention the exact subject, a simple background, the style lock, and negative rules.
- Keep it image-generator friendly.
- Avoid violation-sensitive wording and words that may trigger safety filters.
${STYLE_LOCK}
Return ONLY valid JSON.`;

const PROMPT_SHAPE = `{
  "sceneNumber": number,
  "voiceoverLine": "string",
  "imagePrompt": "string - short direct prompt including the style lock",
  "negativePrompt": "string - negative rules",
  "styleNotes": "string",
  "consistencyNotes": "string - how to keep the character/style consistent across scenes"
}`;

export const generatePrompts = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; scenes: VisualScene[] }) => {
    if (!data?.scenes?.length) throw new Error("Scenes are required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary: "${data.topic}"

Convert each visual scene into one image prompt. Preserve sceneNumber and voiceoverLine.

Return a JSON object:
{ "prompts": [ ${PROMPT_SHAPE} ] }

SCENES:
${JSON.stringify(data.scenes)}`;
    const result = await callAiJson<{ prompts: PromptItem[] }>(PROMPT_RULES, user);
    return (result.prompts ?? []) as PromptItem[];
  });

export const regeneratePrompt = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; scene: VisualScene }) => {
    if (!data?.scene) throw new Error("Scene is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary: "${data.topic}"

Generate a single improved image prompt for this scene. Keep the same sceneNumber and voiceoverLine.

Return a JSON object with this exact shape: ${PROMPT_SHAPE}

SCENE:
${JSON.stringify(data.scene)}`;
    return await callAiJson<PromptItem>(PROMPT_RULES, user);
  });

// ---------------- Thumbnail Engine ----------------

const THUMB_RULES = `${EXPERTS.thumbnail}
STYLE RULES for every idea:
- Simple MS Paint documentary style (flat colors, thick black outlines, simple shapes).
- One clear visual idea, big readable thumbnail text, strong curiosity.
- No clutter, no tiny details, no realistic style, no cinematic 3D, no random decoration.
Return ONLY valid JSON.`;

const THUMB_SHAPE = `{
  "thumbnailTitle": "string",
  "mainVisualConcept": "string",
  "mainSubject": "string",
  "background": "string",
  "emotion": "string",
  "textOnThumbnail": "string - short punchy words shown on the thumbnail",
  "composition": "string",
  "ctrScore": number (1-10),
  "whyItWorks": "string",
  "imagePrompt": "string - MS Paint style prompt for this thumbnail",
  "negativePrompt": "string"
}`;

export const generateThumbnails = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script?: string; angle?: string }) => {
    if (!data?.topic?.trim()) throw new Error("Topic is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary topic: "${data.topic}"
${data.angle ? `Main story angle: ${data.angle}` : ""}
${data.script ? `SCRIPT:\n${data.script.slice(0, 6000)}` : ""}

Generate 10 distinct high-CTR thumbnail ideas.

Return a JSON object:
{ "ideas": [ ${THUMB_SHAPE} ] }`;
    const result = await callAiJson<{ ideas: ThumbnailIdea[] }>(THUMB_RULES, user);
    return (result.ideas ?? []) as ThumbnailIdea[];
  });

export const regenerateThumbnail = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; idea: ThumbnailIdea }) => {
    if (!data?.idea) throw new Error("Idea is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary: "${data.topic}"

Generate one improved, distinct thumbnail idea (different from the one below).

Return a JSON object with this exact shape: ${THUMB_SHAPE}

CURRENT IDEA:
${JSON.stringify(data.idea)}`;
    return await callAiJson<ThumbnailIdea>(THUMB_RULES, user);
  });

// ---------------- SEO Engine ----------------

const SEO_RULES = `${EXPERTS.seo}
TITLE RULES: curiosity-driven, simple English, USA-audience friendly, NOT clickbait, not too long, documentary-style.
Return ONLY valid JSON.`;

const SEO_SHAPE = `{
  "titleOptions": ["10 title options"],
  "bestTitle": "string - the single best title",
  "description": "string - full YouTube video description",
  "tags": ["youtube tags"],
  "hashtags": ["#hashtags"],
  "keywords": ["seo keywords"],
  "pinnedComment": "string",
  "shortSummary": "string - 1-2 sentences",
  "longSummary": "string - a full paragraph",
  "uploadChecklist": ["step-by-step upload checklist items (cards, end screen, chapters, pinned comment, etc.)"]
}`;

export const generateSeo = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script?: string }) => {
    if (!data?.topic?.trim()) throw new Error("Topic is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary topic: "${data.topic}"
${data.script ? `SCRIPT:\n${data.script.slice(0, 8000)}` : ""}

Generate complete upload-ready YouTube metadata.

Return a JSON object with this exact shape: ${SEO_SHAPE}`;
    return await callAiJson<Omit<Seo, "topicId" | "generatedAt">>(SEO_RULES, user);
  });

export const regenerateTitles = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script?: string }) => {
    if (!data?.topic?.trim()) throw new Error("Topic is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary topic: "${data.topic}"
${data.script ? `SCRIPT:\n${data.script.slice(0, 4000)}` : ""}

Generate 10 fresh title options and pick the best one.

Return a JSON object: { "titleOptions": ["..."], "bestTitle": "string" }`;
    return await callAiJson<{ titleOptions: string[]; bestTitle: string }>(
      SEO_RULES,
      user,
    );
  });

// ---------------- Rating Engine ----------------

const RATING_RULES = `${EXPERTS.reviewer} You rate a documentary video BEFORE production so it can be fixed. Be specific and honest. Return ONLY valid JSON.`;

const RATING_SHAPE = `{
  "hookScore": number (1-10),
  "storyScore": number (1-10),
  "retentionScore": number (1-10),
  "visualClarityScore": number (1-10),
  "thumbnailCtrScore": number (1-10),
  "originalityScore": number (1-10),
  "evergreenScore": number (1-10),
  "overallScore": number (1-10),
  "ctrPrediction": "string - predicted click-through performance with reasoning",
  "retentionPrediction": "string - predicted audience retention with reasoning",
  "weakestPart": "string - the single weakest part of the video",
  "bestPart": "string - the single best part of the video",
  "weakPoints": ["..."],
  "strongPoints": ["..."],
  "whatToImprove": ["..."],
  "recommendation": "Ready | Needs Rewrite | Weak Topic"
}`;

export const rateVideo = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      topic: string;
      hook?: string;
      script?: string;
      visualMap?: string;
      thumbnails?: string;
    }) => {
      if (!data?.topic?.trim()) throw new Error("Topic is required");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const user = `Rate this documentary video plan.

Topic: "${data.topic}"
${data.hook ? `HOOK:\n${data.hook}` : ""}
${data.script ? `SCRIPT:\n${data.script.slice(0, 7000)}` : ""}
${data.visualMap ? `VISUAL MAP:\n${data.visualMap.slice(0, 3000)}` : ""}
${data.thumbnails ? `THUMBNAIL IDEAS:\n${data.thumbnails.slice(0, 2000)}` : ""}

Return a JSON object with this exact shape: ${RATING_SHAPE}`;
    return await callAiJson<Omit<RatingReport, "topicId" | "generatedAt">>(
      RATING_RULES,
      user,
    );
  });

export const improveWeakPoints = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; weakPoints: string[] }) => {
    if (!data?.weakPoints?.length) throw new Error("Weak points are required");
    return data;
  })
  .handler(async ({ data }) => {
    const system = `You are a documentary production coach. Give concrete, actionable fixes.`;
    const user = `For the documentary "${data.topic}", provide clear, specific instructions to fix each weak point below. Return plain text with one numbered fix per weak point.

WEAK POINTS:
${data.weakPoints.map((w, i) => `${i + 1}. ${w}`).join("\n")}`;
    return { text: await callAiText(system, user) };
  });
// ---------------- Audio Suggestion Engine (V6) ----------------

export const suggestAudio = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script?: string }) => {
    if (!data?.topic?.trim()) throw new Error("Topic is required");
    return data;
  })
  .handler(async ({ data }) => {
    const system = `You are the AUDIO DIRECTOR of a documentary production studio. You suggest background music moods and sound effects placement. You never generate audio. Return ONLY valid JSON.`;
    const user = `Documentary: "${data.topic}"
${data.script ? `SCRIPT:\n${data.script.slice(0, 7000)}` : ""}

Suggest background music cues and sound effect placements for this documentary.
Music moods to draw from: Curious, Epic, Emotional, Dark, Historical, Educational.
SFX examples: Whoosh, Pop, Clock Tick, Explosion, Wind, Paper, Footsteps.

Return a JSON object:
{
  "music": [ { "mood": "one of the moods", "placement": "where in the video it should play / change", "reason": "why" } ],
  "sfx": [ { "effect": "sound effect name", "placement": "exact moment/line it should hit" } ]
}`;
    const result = await callAiJson<{ music: MusicCue[]; sfx: SfxCue[] }>(system, user);
    return { music: result.music ?? [], sfx: result.sfx ?? [] };
  });

// ---------------- V7: Deep Quality Reviews ----------------

import type {
  StoryReview,
  ThumbnailReview,
  ConsistencyReport,
} from "./types";

// Story Review — checks weak hook, slow pacing, repeated ideas, weak ending,
// missing central conflict, and low curiosity, then suggests fixes.
export const reviewStory = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script: string }) => {
    if (!data?.script?.trim()) throw new Error("Script is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Review this documentary script for "${data.topic}". Be ruthless.
Return a JSON object:
{
  "weakHook": "assessment of the hook (or 'strong' with why)",
  "slowPacing": "where pacing drags (or 'none')",
  "repeatedIdeas": "any repeated ideas (or 'none')",
  "weakEnding": "assessment of the ending",
  "centralConflict": "is there ONE clear central conflict? explain",
  "lowCuriosity": "where curiosity drops (or 'none')",
  "suggestions": ["concrete improvements"],
  "score": number (1-10)
}

SCRIPT:
${data.script.slice(0, 9000)}`;
    return await callAiJson<StoryReview>(EXPERTS.reviewer, user);
  });

// Thumbnail Review — scores each idea on CTR, emotion, composition,
// readability, curiosity, then recommends the strongest.
export const reviewThumbnails = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; ideas: ThumbnailIdea[] }) => {
    if (!data?.ideas?.length) throw new Error("Ideas are required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Review these ${data.ideas.length} thumbnail ideas for "${data.topic}".
Score each (0-based index matching input order) and recommend the strongest.
Return a JSON object:
{
  "scored": [ { "index": number, "ctr": number(1-10), "emotion": number(1-10), "composition": number(1-10), "readability": number(1-10), "curiosity": number(1-10), "overall": number(1-10), "note": "one line" } ],
  "recommendedIndex": number,
  "reason": "why this one wins"
}

IDEAS:
${JSON.stringify(data.ideas.map((i, idx) => ({ index: idx, title: i.thumbnailTitle, concept: i.mainVisualConcept, text: i.textOnThumbnail, emotion: i.emotion })))}`;
    return await callAiJson<ThumbnailReview>(EXPERTS.thumbnail, user);
  });

// Image Consistency — reasons over scene metadata to flag consistency and
// ordering problems, missing/duplicate scenes, and suggests fixes.
export const checkImageConsistency = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { topic: string; scenes: VisualScene[]; withImages: number[] }) => {
      if (!data?.scenes?.length) throw new Error("Scenes are required");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const numbers = data.scenes.map((s) => s.sceneNumber).sort((a, b) => a - b);
    const user = `You review a documentary storyboard for consistency. The studio style is:
Simple MS Paint educational style, flat colors, thick black outlines, bald stickman character, simple varied backgrounds.

Check: character consistency, color consistency, outline consistency, background consistency, scene order (no skipped numbers), missing images, duplicate scenes.

Scene numbers present: ${numbers.join(", ")}
Scenes WITH a generated image: ${data.withImages.join(", ") || "none"}

Return a JSON object:
{
  "characterConsistent": boolean,
  "colorConsistent": boolean,
  "outlineConsistent": boolean,
  "backgroundConsistent": boolean,
  "orderOk": boolean,
  "missingScenes": [numbers with no generated image],
  "duplicateScenes": [duplicated scene numbers],
  "flagged": [ { "sceneNumber": number, "issues": ["..."], "fix": "..." } ],
  "summary": "one paragraph overall verdict"
}

SCENES:
${JSON.stringify(data.scenes.map((s) => ({ n: s.sceneNumber, subject: s.mainSubject, bg: s.background, type: s.sceneType, desc: s.visualDescription })))}`;
    return await callAiJson<ConsistencyReport>(EXPERTS.visual, user);
  });

// ---------------- Script Analyzer ----------------

export type ScriptPattern = {
  hookStructure: string;
  pacing: string;
  sectionFlow: string;
  curiosityLoops: string;
  transitionStyle: string;
  evidencePlacement: string;
  endingStyle: string;
  avgSentenceLength: string;
  tone: string;
  storyRhythm: string;
  summary: string;
};

export const analyzeScript = createServerFn({ method: "POST" })
  .inputValidator((data: { script: string }) => {
    if (!data?.script || data.script.trim().length < 40)
      throw new Error("Paste a longer reference script to analyze.");
    return { script: data.script.slice(0, 24000) };
  })
  .handler(async ({ data }) => {
    const user = `Analyze this reference documentary narration script and extract its storytelling PATTERN only. Do NOT copy any wording. Describe HOW it is written so the structure can be reused for a different topic.

Return a JSON object:
{
  "hookStructure": "how the opening hook grabs attention",
  "pacing": "fast/slow/varied and how it builds",
  "sectionFlow": "how sections are ordered and connected",
  "curiosityLoops": "how open questions are opened and closed",
  "transitionStyle": "how it moves between beats",
  "evidencePlacement": "when and how facts/evidence appear",
  "endingStyle": "how it concludes and lands the payoff",
  "avgSentenceLength": "short/medium/long with rough word range",
  "tone": "voice and emotional register",
  "storyRhythm": "overall rhythm pattern of tension and release",
  "summary": "2-3 sentence overview of the reusable structure"
}

REFERENCE SCRIPT:
${data.script}`;
    return await callAiJson<ScriptPattern>(EXPERTS.story, user);
  });

export const generateScriptFromPattern = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; pattern: ScriptPattern }) => {
    if (!data?.topic || data.topic.trim().length < 2)
      throw new Error("Enter a topic for the new script.");
    if (!data?.pattern) throw new Error("Analyze a reference script first.");
    return { topic: data.topic.trim().slice(0, 400), pattern: data.pattern };
  })
  .handler(async ({ data }) => {
    const p = data.pattern;
    const user = `Write an ORIGINAL documentary narration script about this topic, following the analyzed STRUCTURE below. Reuse the structural pattern only. NEVER copy any phrasing, sentences, or unique wording from the reference. All wording must be your own and original.

TOPIC: ${data.topic}

STRUCTURE TO FOLLOW:
- Hook structure: ${p.hookStructure}
- Pacing: ${p.pacing}
- Section flow: ${p.sectionFlow}
- Curiosity loops: ${p.curiosityLoops}
- Transition style: ${p.transitionStyle}
- Evidence placement: ${p.evidencePlacement}
- Ending style: ${p.endingStyle}
- Average sentence length: ${p.avgSentenceLength}
- Tone: ${p.tone}
- Story rhythm: ${p.storyRhythm}

Return a JSON object:
{
  "script": "the full original narration script as plain text",
  "originality": {
    "score": number (1-10, higher = more original / less like the reference),
    "verdict": "one-line originality verdict",
    "notes": ["how you kept it structurally similar but original in wording"]
  }
}`;
    return await callAiJson<{
      script: string;
      originality: { score: number; verdict: string; notes: string[] };
    }>(EXPERTS.story, user);
  });
