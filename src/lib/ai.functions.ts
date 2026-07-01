import { createServerFn } from "@tanstack/react-start";
import { callAiJson, callAiText } from "./ai-gateway.server";
import type {
  PromptItem,
  RatingReport,
  Research,
  Seo,
  ThumbnailIdea,
  VisualScene,
} from "./types";

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
    const system = `You are an elite documentary researcher, not a chatbot. You dig for the real story: the central tension, surprising truths, myths people believe, and the human drama. You are rigorous, specific, and cite real, credible source types. Return ONLY valid JSON.`;
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
  "keyTakeaways": ["the core things the viewer should remember"]
}`;
    return await callAiJson<ResearchData>(system, user);
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
  .inputValidator((data: { topic: string; research?: Research }) => {
    if (!data?.topic?.trim()) throw new Error("Topic is required");
    return data;
  })
  .handler(async ({ data }) => {
    const system = `You are a master documentary scriptwriter for long-form YouTube. ${STORY_RULES}
Return ONLY valid JSON.`;
    const user = `Write a full documentary narration script for: "${data.topic}"

${buildResearchContext(data.research)}

Return a JSON object:
{
  "script": "string - the complete narration script, using clear section markers and paragraphs (use \\n for line breaks)",
  "hookScore": number (1-10),
  "storyScore": number (1-10),
  "engagementScore": number (1-10)
}`;
    return await callAiJson<{
      script: string;
      hookScore: number;
      storyScore: number;
      engagementScore: number;
    }>(system, user);
  });

export const rewriteHook = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script: string }) => {
    if (!data?.script?.trim()) throw new Error("Script is required");
    return data;
  })
  .handler(async ({ data }) => {
    const system = `You are a master documentary scriptwriter. ${STORY_RULES}`;
    const user = `Here is a documentary script for "${data.topic}". Rewrite ONLY the opening hook (roughly the first 1-2 paragraphs) to be dramatically stronger — more curiosity, tension, and pull — then return the FULL script with the new hook and the rest unchanged. Return plain text only.

SCRIPT:
${data.script}`;
    return { script: await callAiText(system, user) };
  });

export const improveStory = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; script: string }) => {
    if (!data?.script?.trim()) throw new Error("Script is required");
    return data;
  })
  .handler(async ({ data }) => {
    const system = `You are a master documentary scriptwriter and editor. ${STORY_RULES}`;
    const user = `Improve the storytelling of this documentary script for "${data.topic}": tighten pacing, remove filler, strengthen transitions, and make each section reveal something new. Keep it the same topic and length range. Return the improved FULL script as plain text only.

SCRIPT:
${data.script}`;
    return { script: await callAiText(system, user) };
  });

// ---------------- Visual Engine ----------------

const VISUAL_RULES = `You are a documentary visual director building a shot-by-shot beat map for image generation.
RULES:
- One visual beat = one image. Never combine multiple ideas into one image.
- Every voiceover line must have a matching visual.
- If one sentence contains multiple objects/actions, split it into multiple scenes.
- A character should appear only when needed.
- If the line is about an object, show only that object.
- If the line is about a concept, create a simple visual metaphor.
- Avoid repeated boring backgrounds — vary them.
- Each scene must be understandable in 1 second.
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
  .inputValidator((data: { topic: string; script: string }) => {
    if (!data?.script?.trim()) throw new Error("Script is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary: "${data.topic}"

Break the following script into a sequential visual beat map. Number scenes starting at 1.

Return a JSON object:
{ "scenes": [ ${SCENE_SHAPE} ] }

SCRIPT:
${data.script}`;
    const result = await callAiJson<{ scenes: VisualScene[] }>(VISUAL_RULES, user);
    return (result.scenes ?? []) as VisualScene[];
  });

export const regenerateScene = createServerFn({ method: "POST" })
  .inputValidator((data: { topic: string; scene: VisualScene }) => {
    if (!data?.scene) throw new Error("Scene is required");
    return data;
  })
  .handler(async ({ data }) => {
    const user = `Documentary: "${data.topic}"

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

const PROMPT_RULES = `You convert one visual scene into one image-generation prompt.
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

const THUMB_RULES = `You are a YouTube thumbnail strategist for documentary channels.
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

const SEO_RULES = `You generate upload-ready YouTube metadata for documentary videos.
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
  "longSummary": "string - a full paragraph"
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

const RATING_RULES = `You are a ruthless but fair YouTube documentary reviewer. You rate a video BEFORE production so it can be fixed. Be specific and honest. Return ONLY valid JSON.`;

const RATING_SHAPE = `{
  "hookScore": number (1-10),
  "storyScore": number (1-10),
  "retentionScore": number (1-10),
  "visualClarityScore": number (1-10),
  "thumbnailCtrScore": number (1-10),
  "originalityScore": number (1-10),
  "evergreenScore": number (1-10),
  "overallScore": number (1-10),
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