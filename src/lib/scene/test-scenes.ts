import type { SceneSpec } from "./scene-model";

export const TEST_SCENES: SceneSpec[] = [
  {
    sceneId: "test-01-walking-night",
    aspectRatio: "16:9",
    environment: "outdoor",
    timeOfDay: "night",
    camera: "wide",
    background: { type: "street", groundY: 430, skyColor: "#1B234E", groundColor: "#4A4A66" },
    characters: [
      { rigId: "primary", pose: "walking-right", expression: "line", x: 560, grounded: true, scale: 1 },
    ],
    objects: [
      { type: "moon", anchor: "sky-right", scale: 0.9 },
      { type: "streetlight", anchor: "ground-left", x: 140, scale: 0.9 },
      { type: "streetlight", anchor: "ground-center", x: 460, scale: 0.9 },
      { type: "streetlight", anchor: "ground-right", x: 820, scale: 0.9 },
    ],
  },
  {
    sceneId: "test-02-campsite",
    aspectRatio: "16:9",
    environment: "outdoor",
    timeOfDay: "night",
    camera: "medium",
    background: { type: "campsite", groundY: 440, skyColor: "#151B3E", groundColor: "#3B5039" },
    characters: [
      { rigId: "primary", pose: "sitting-ground", expression: "smile", x: 540, grounded: true, scale: 1 },
    ],
    objects: [
      { type: "moon", anchor: "sky-left", scale: 0.8 },
      { type: "tree", anchor: "background", x: 120, scale: 0.9 },
      { type: "tree", anchor: "background", x: 860, scale: 1.05 },
      { type: "tent", anchor: "behind-character", x: 300, scale: 1 },
      { type: "campfire", anchor: "ground-center", x: 680, scale: 1 },
    ],
  },
  {
    sceneId: "test-03-pointing-machine",
    aspectRatio: "16:9",
    environment: "outdoor",
    timeOfDay: "day",
    camera: "medium",
    background: { type: "plain", groundY: 460, skyColor: "#FFFFFF", groundColor: "#FFFFFF" },
    characters: [
      { rigId: "primary", pose: "pointing-right", expression: "line", x: 300, grounded: true, scale: 1 },
    ],
    objects: [
      { type: "machine", anchor: "character-pointing-target", scale: 1.1 },
      { type: "checkmark", anchor: "free", x: 690, y: 300, scale: 1 },
    ],
  },
  {
    sceneId: "test-04-classroom-infographic",
    aspectRatio: "16:9",
    environment: "infographic",
    timeOfDay: "day",
    camera: "medium",
    background: { type: "classroom", groundY: 470, skyColor: "#FFFFFF", groundColor: "#FFFFFF" },
    characters: [
      { rigId: "primary", pose: "pointing-right", expression: "smile", x: 260, grounded: true, scale: 1 },
    ],
    objects: [
      {
        type: "board", anchor: "free", x: 640, y: 240, scale: 1,
        data: { lines: ["1. Define the problem", "2. Break it down", "3. Solve one step", "4. Verify the answer"] },
      },
    ],
  },
  {
    sceneId: "test-05-one-in-seven",
    aspectRatio: "16:9",
    environment: "infographic",
    timeOfDay: "day",
    camera: "wide",
    background: { type: "plain", groundY: 540, skyColor: "#FFFFFF", groundColor: "#FFFFFF" },
    characters: [],
    objects: [
      { type: "circle-row", anchor: "free", x: 480, y: 290, scale: 1, data: { count: 7, highlight: 3 } },
      { type: "arrow", anchor: "free", x: 480, y: 400, scale: 0.9, data: { rotation: -90 } },
    ],
  },
];