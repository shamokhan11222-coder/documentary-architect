// Content-mode detector for the image pipeline.
//
// The default Stickmax style was hard-coded across every scene and thumbnail,
// which turned nature/wildlife topics (e.g. "A Day in the Life of a Baby Polar
// Bear") into unrelated alien-stickman drawings. This module reads the active
// project's topic/title/story and decides which content mode to apply, plus
// extracts the primary animal subject when applicable so every scene prompt
// can be locked to the real subject.
export type ContentMode =
  | "animal-documentary"
  | "stickman-explainer"
  | "infographic"
  | "general-documentary";

interface AnimalMatch {
  keyword: string;
  subjectLock: string;
  environment: string;
}

const ANIMAL_TABLE: AnimalMatch[] = [
  {
    keyword: "polar bear",
    subjectLock:
      "the same baby polar bear cub, small round body, thick white fluffy fur, black nose, small dark eyes, short rounded ears, age-consistent proportions, identical in every scene",
    environment: "arctic sea ice, snow, frozen ocean, cold blue sky",
  },
  { keyword: "penguin", subjectLock: "the same emperor penguin, black back, white belly, yellow neck patch, small flippers, identical in every scene", environment: "antarctic ice, snow, cold ocean" },
  { keyword: "tiger", subjectLock: "the same tiger, orange fur with black stripes, muscular body, green eyes, identical markings in every scene", environment: "dense jungle, tall grass, forest" },
  { keyword: "lion", subjectLock: "the same lion, tawny fur, dark mane, amber eyes, identical in every scene", environment: "african savanna, dry grass, acacia trees" },
  { keyword: "elephant", subjectLock: "the same african elephant, gray wrinkled skin, long trunk, large ears, ivory tusks, identical in every scene", environment: "savanna, watering hole, dry plains" },
  { keyword: "wolf", subjectLock: "the same gray wolf, thick gray fur, yellow eyes, pointed ears, identical markings in every scene", environment: "snowy forest, pine trees, mountains" },
  { keyword: "fox", subjectLock: "the same red fox, orange fur, white chest, bushy tail with white tip, identical in every scene", environment: "forest, meadow, snowy field" },
  { keyword: "whale", subjectLock: "the same humpback whale, dark blue-gray skin, long white flippers, identical markings in every scene", environment: "open ocean, deep blue water" },
  { keyword: "dolphin", subjectLock: "the same bottlenose dolphin, sleek gray body, curved dorsal fin, identical in every scene", environment: "clear ocean, tropical sea" },
  { keyword: "shark", subjectLock: "the same great white shark, gray back, white belly, sharp teeth, identical in every scene", environment: "deep ocean, blue water" },
  { keyword: "eagle", subjectLock: "the same bald eagle, white head, yellow beak, dark brown body, identical in every scene", environment: "mountain sky, forest, river" },
  { keyword: "owl", subjectLock: "the same snowy owl, white feathers with black flecks, yellow eyes, identical in every scene", environment: "arctic tundra, moonlit sky" },
  { keyword: "monkey", subjectLock: "the same monkey, brown fur, expressive face, long tail, identical in every scene", environment: "rainforest canopy, jungle" },
  { keyword: "gorilla", subjectLock: "the same silverback gorilla, black fur with silver back, muscular build, identical in every scene", environment: "mountain rainforest, mist, dense foliage" },
  { keyword: "kangaroo", subjectLock: "the same red kangaroo, reddish-brown fur, powerful hind legs, long tail, identical in every scene", environment: "australian outback, red earth, dry grass" },
  { keyword: "koala", subjectLock: "the same koala, gray fur, fluffy ears, black nose, identical in every scene", environment: "eucalyptus forest, tree branches" },
  { keyword: "panda", subjectLock: "the same giant panda, black-and-white fur, round face, identical markings in every scene", environment: "bamboo forest, misty mountains" },
  { keyword: "cheetah", subjectLock: "the same cheetah, tan fur with black spots, slender body, black tear-lines, identical in every scene", environment: "african savanna, grasslands" },
  { keyword: "leopard", subjectLock: "the same leopard, golden fur with rosette spots, identical markings in every scene", environment: "african savanna, rocky outcrops, trees" },
  { keyword: "bear", subjectLock: "the same bear, thick brown fur, muscular body, identical in every scene", environment: "forest, river, mountains" },
  { keyword: "deer", subjectLock: "the same deer, brown coat, white spots on the flanks, gentle eyes, identical in every scene", environment: "forest clearing, meadow" },
];

const ANIMAL_TRIGGER_WORDS = [
  "animal", "wildlife", "wild ", "species", "habitat", "predator", "prey",
  "hunt", "survival", "life cycle", "documentary of a", "day in the life",
  "safari", "ocean life", "arctic", "jungle", "savanna", "rainforest",
];

const STICKMAN_TRIGGERS = [
  "explain", "how it works", "why does", "psychology", "money", "economy",
  "history of", "philosophy", "science of",
];

const INFOGRAPHIC_TRIGGERS = [
  "infographic", "chart", "statistics", "data visualization", "diagram",
];

function activeTopic(): { topic: string; title: string; script: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const id = JSON.parse(localStorage.getItem("docos.selectedTopic") ?? "null");
    if (!id) return null;
    const topics = JSON.parse(localStorage.getItem("docos.topics") ?? "[]") as Array<{
      id: string; topic?: string; title?: string;
    }>;
    const t = topics.find((x) => x?.id === id);
    const stories = JSON.parse(localStorage.getItem("docos.story") ?? "{}") as Record<string, { script?: string; title?: string }>;
    const s = stories[id];
    return {
      topic: (t?.topic ?? "").toLowerCase(),
      title: (t?.title ?? s?.title ?? "").toLowerCase(),
      script: (s?.script ?? "").toLowerCase().slice(0, 4000),
    };
  } catch {
    return null;
  }
}

export interface DetectedContent {
  mode: ContentMode;
  animal?: AnimalMatch;
}

/** Detect the current project's content mode + primary animal (if any). */
export function detectContentMode(): DetectedContent {
  const ctx = activeTopic();
  if (!ctx) return { mode: "stickman-explainer" };
  const haystack = `${ctx.topic} ${ctx.title} ${ctx.script}`;

  // Animal-documentary wins if an animal keyword is present OR clear
  // wildlife-trigger phrasing.
  const animal = ANIMAL_TABLE.find((a) => haystack.includes(a.keyword));
  const wildlifeTrigger = ANIMAL_TRIGGER_WORDS.some((w) => haystack.includes(w));
  if (animal || wildlifeTrigger) {
    return { mode: "animal-documentary", animal };
  }
  if (INFOGRAPHIC_TRIGGERS.some((w) => haystack.includes(w))) {
    return { mode: "infographic" };
  }
  if (STICKMAN_TRIGGERS.some((w) => haystack.includes(w))) {
    return { mode: "stickman-explainer" };
  }
  return { mode: "general-documentary" };
}

/** Localise the detected animal noun-phrase into a scene subject. */
export function primarySubjectLock(d: DetectedContent): string | null {
  return d.animal?.subjectLock ?? null;
}

/** Validate that an animal-mode prompt actually references the subject and
 *  has NO stickman-family terms. Returns null on success, else an error. */
export function validateAnimalPrompt(prompt: string, d: DetectedContent): string | null {
  if (d.mode !== "animal-documentary" || !d.animal) return null;
  const p = prompt.toLowerCase();
  if (!p.includes(d.animal.keyword)) {
    return `Scene prompt is missing the animal "${d.animal.keyword}".`;
  }
  const forbidden = ["stickman", "stick figure", "stick-figure", "alien", "bean body", "mascot", "cyanide", "explosm"];
  const hit = forbidden.find((w) => p.includes(w));
  if (hit) return `Scene prompt contains forbidden term "${hit}" for animal-documentary mode.`;
  return null;
}