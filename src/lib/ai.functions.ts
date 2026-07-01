import { createServerFn } from "@tanstack/react-start";
import { callAiJson, callAiText } from "./ai-gateway.server";
import type { Research } from "./types";

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
    return await callAiJson<Record<string, unknown>>(system, user);
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