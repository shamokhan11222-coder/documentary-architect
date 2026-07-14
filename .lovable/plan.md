## Phase 5B — Scene Composer Lab (isolated)

Builds a `/scene-composer-lab` route that composes 5 test scenes from a strict `SceneSpec` JSON using the Phase 5A rig. No production pipeline is touched.

### Files created
```
src/lib/scene/
  scene-model.ts       SceneSpec, ObjectSpec, CharacterSpec, LayoutWarning types
  joints.ts            getJointPositions(rig, pose) → world coords for hands/feet/head
  object-library.tsx   SVG components: tree, sun, moon, cloud, streetlight, campfire,
                       tent, chair, table, machine, parking-meter, arrow, red-circle,
                       checkmark, cross, house, road/path — plus getBBox() per type
  layout.ts            Constraint resolver: ground-snap, sky-region clamp, joint-anchor
                       binding, canvas-margin clamp, overlap detection, warnings
  render-scene.tsx     SceneRenderer — resolves layout, draws bg → objects → chars,
                       supports bbox overlay + layer-order overlay
  test-scenes.ts       The 5 exact SceneSpec objects
  export.ts            Scene SVG → PNG (opaque or transparent), JSON download

src/routes/scene-composer-lab.tsx
```

### Scene coordinate system
- Viewbox `960 × 540` (16:9).
- Default `groundY = 420`, sky region `y < groundY - 40`.
- Character `x` = feet center x; feet always placed on `groundY` when `grounded`.
- Object anchors:
  - `ground` → bottom of bbox = groundY
  - `sky` → top of bbox in sky region
  - `character-{left|right}-hand` → bbox center attached to that joint of the referenced rig
  - `character-pointing-target` → 60px ahead of the extended arm end, ground-snapped
  - `seated-under-character` → chair/rock placed so its seat aligns with character pelvis
  - `behind-character` → same x, z-order below the character
  - `foreground` / `background` → z-order buckets only

### Constraint resolver (`layout.ts`)
1. Assign z-layer: `background` (0) → `background-props` (10) → `characters` (20) → `foreground` (30) → `labels` (40).
2. For each object: resolve anchor to a target `(x, y)`, then clamp `x` to `[40, 920]`.
3. For character-attached objects, compute joint world position via `joints.ts` after the character's own placement is known.
4. Ground-snap grounded items.
5. Sky-region items get `y` clamped to `[40, groundY - 60]`.
6. Detect bbox overlap between focal subject and large props; if a background prop overlaps the focal subject bbox by > 30%, push it horizontally to the nearest edge; if still overlapping → emit `LayoutWarning`.
7. Camera scale: `wide` = char h ~28% canvas, `medium` = ~50%, `close` = ~72%. Applied uniformly by scaling the rig svg (never distorting).

### 5 test scenes (`test-scenes.ts`)
Exactly per spec: walking-at-night, campsite, pointing-at-machine, classroom-infographic, one-in-seven-diagram.

### Object rendering
Each object type is a function returning `{ svg: ReactNode, bbox: {w,h} }` at its natural size. Same rough black outline, `stroke-linecap="round"`, thickness matched to rig `lineThickness`. Reuses the rig's roughness filter feel.

### Lab UI
- 5 panels stacked, each showing:
  - final 16:9 preview
  - toggles: [Bounding boxes] [Layer order] [Show JSON] [Show warnings]
  - export buttons: [SVG] [PNG opaque] [PNG transparent] [JSON]
- Reads the approved rig from Phase 5A (`loadRig()`). If no rig approved yet, shows a friendly banner linking to `/character-rig-lab`.

### Verification with Playwright
- Load `/scene-composer-lab`, screenshot each panel, view all five in QA.
- Confirm ground-snapped items and joint-attached items.

### NOT touched
Research, Story, Storyboard, Voice, Thumbnail, SEO, Rating, Auth, project data, image queue, style-lock, credit-saver, existing image pipeline. The lab is a self-contained page.
