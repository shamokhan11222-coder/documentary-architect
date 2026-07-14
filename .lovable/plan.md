## Phase 5A — Rigged Stickman Character System

Build an isolated "Character Rig Lab" that turns an uploaded stickman reference into a reusable, poseable vector rig. Nothing outside this feature is touched (Research, Story, Storyboard, Voice, SEO, Rating, Thumbnail, Auth, project data all untouched).

### Scope boundary
- New route only: `/character-rig-lab`
- New lib modules only under `src/lib/rig/`
- Existing scene/image pipeline is NOT wired to the rig yet (that's Phase 5B)

### Architecture

```
src/lib/rig/
  bg-remove.ts        client-side white-bg removal (canvas flood + tolerance)
  traits.ts           extract head/eye/mouth/line-thickness traits from reference
  rig-model.ts        Rig type: bones, joints, lengths, trait tokens
  poses.ts            15 named poses as joint-angle presets
  render-svg.tsx      pure SVG renderer — draws bones/head/face from Rig + Pose
  export.ts           SVG → PNG (transparent), SVG string, pose JSON
  storage.ts          IndexedDB persistence of approved rig (key: rig:active)

src/routes/character-rig-lab.tsx
  - Upload + background removal step (tolerance slider, erase/restore brush, Confirm)
  - Trait extraction preview (auto, editable)
  - 6-panel pose grid (standing, walking, pointing, sitting, sleeping, running)
  - Controls: Pose / Expression / Facing / Arm angle / Leg angle / Head tilt / Scale / Reset
  - Export buttons per pose: PNG, SVG, Pose JSON
```

### How the reference becomes a rig (not a sprite)

1. **Background removal** — canvas pixel pass: pixels within tolerance of corner-sampled white → alpha 0. Manual erase/restore brushes patch mistakes. Result stored as transparent PNG in IndexedDB (`rig:reference`).
2. **Trait extraction** — measure isolated silhouette to derive tokens only:
   - `lineThickness` (median stroke width via distance transform approximation)
   - `headRadius` / `headShape` (circle vs oval from bounding box of top blob)
   - `eyeStyle` (dots | circles | crosses — detected from dark spots in head region; user-editable)
   - `mouthStyle` (line | curve | open — user-selectable, seeded from detection)
   - `handStyle` / `footStyle` (none | dot | stub — user-selectable)
   - `outlineRoughness` (0–1, seeded from edge variance)
   These tokens feed the SVG renderer. The bitmap itself is NEVER drawn into a pose.
3. **Rig model** — fixed skeleton (head, torso, 2× upper/lower arm, 2× upper/lower leg) with joint angles. Head size and limb lengths are constants derived once from the reference; poses only change angles.
4. **SVG renderer** — draws circles + lines using trait tokens. Applies `filter: url(#rough)` (SVG turbulence displacement) scaled by `outlineRoughness` so lines look hand-drawn without being anime/cartoon.

### Poses (angle presets in `poses.ts`)

15 poses as `{ head, neck, lShoulder, lElbow, rShoulder, rElbow, lHip, lKnee, rHip, rKnee, torsoRotation, rootY }`. Sleeping sets `torsoRotation: 90` and lowers `rootY`. Sitting bends hips 90° + knees 90°. Walking/running alternate limb angles.

### Expressions
Separate `Expression` type mutates only `eyeDirection`, `eyebrow`, `mouthCurve`, `headTilt`. No proportion changes.

### Test canvas (Character Rig Lab)
Six panels rendered from the SAME `Rig` with different `Pose` presets, plain white bg. Controls panel drives a 7th "live" preview. Export buttons on each panel.

### Export
- **PNG**: serialize SVG → `<img>` → offscreen canvas → `toBlob('image/png')` (transparent).
- **SVG**: serialized SVG string download.
- **Pose JSON**: `{ pose, headRotation, leftShoulder, ... }`.

### Persistence
IndexedDB keys:
- `rig:reference` — approved transparent PNG (for reference display only)
- `rig:active` — `{ traits, limbLengths, headRadius }` JSON
- `rig:poses:custom` — user-tweaked poses
Refresh restores everything.

### Acceptance checks I will verify with Playwright
1. Upload → BG removed → checkerboard preview shows no white rectangle.
2. Confirm Character → 6-panel grid renders.
3. Screenshot all 6 panels; visually confirm same character, different limb positions.
4. PNG export downloads a transparent file.
5. Reload page → rig restored from IndexedDB.

### Files created
- `src/lib/rig/bg-remove.ts`
- `src/lib/rig/traits.ts`
- `src/lib/rig/rig-model.ts`
- `src/lib/rig/poses.ts`
- `src/lib/rig/render-svg.tsx`
- `src/lib/rig/export.ts`
- `src/lib/rig/storage.ts`
- `src/routes/character-rig-lab.tsx`

### Files NOT modified
Research, Story, Storyboard, Voice, SEO, Rating, Thumbnail, Auth, project data, existing image pipeline, credit-saver, style-lock. Confirmed by scope.

### Out of scope for 5A (explicit)
- Wiring the rig into storyboard/thumbnail generation
- Compositing rig over AI backgrounds
- Multi-character scenes
- Animation timelines
These belong to Phase 5B.
