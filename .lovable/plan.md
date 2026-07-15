## Phase 8 — AI Image Studio (production redesign)

Rebuild the Images module as an 8-tab studio. Nothing outside `visual*`, `image*`, and the new `image-studio` route is touched. Story / Voice / Sync / Research / Timeline stay untouched.

### New route

- `src/routes/image-studio.tsx` — single route hosting the studio shell with a left sidebar and a right work panel. Sidebar tabs (URL-driven via `?tab=`):
  1. Overview
  2. Image Queue
  3. Characters (Character Lock)
  4. Style Lock
  5. Backgrounds (Background Lock)
  6. Providers
  7. Assets
  8. History
  9. Settings

Old `visual.tsx` stays as a redirect wrapper → `/image-studio` so existing links keep working.

### Files created

- `src/routes/image-studio.tsx` — shell + tab router
- `src/components/image-studio/Sidebar.tsx`
- `src/components/image-studio/OverviewPanel.tsx` — 6 stat tiles (Scenes / Complete / Queued / Failed / Locked / ETA), live from queue
- `src/components/image-studio/QueuePanel.tsx` — filterable table (scene #, thumb, status, provider, retry, replace, priority)
- `src/components/image-studio/CharacterLockPanel.tsx` — master upload + 8 lock toggles (face/body/clothes/hair/accessories/expression/style/pose family)
- `src/components/image-studio/StyleLockPanel.tsx` — 8 global controls (art style, lighting, line weight, camera angle, palette, background style, aspect ratio, perspective)
- `src/components/image-studio/BackgroundLockPanel.tsx` — environment/weather/time/fog/snow/sky/landscape
- `src/components/image-studio/ProviderPanel.tsx` — enable/disable + drag-priority for OpenRouter / Gemini / Grok / Local SDXL, with automatic failover toggle
- `src/components/image-studio/AssetsPanel.tsx` — grid of all generated images (search, filter, bulk delete)
- `src/components/image-studio/HistoryPanel.tsx` — chronological log of generations w/ prompt + provider + score
- `src/components/image-studio/SettingsPanel.tsx` — batch size, concurrency, min consistency threshold, auto-retry policy
- `src/components/image-studio/ImageInspector.tsx` — modal: zoom / replace / re-generate / pin / delete / copy prompt / download
- `src/components/image-studio/FailedRecoveryDialog.tsx` — Retry / Retry Another Provider / Skip / Continue Queue
- `src/components/image-studio/SmartBatchBar.tsx` — 5 / 10 / 20 / 50 / 100 / Entire Project
- `src/lib/image-studio/queue-engine.ts` — background job runner, survives tab switches, resumes on refresh from `localStorage`
- `src/lib/image-studio/consistency.ts` — heuristic scorer (character / prompt-match / style / background / lighting / overall) — pure client, no paid provider calls. Below-80 triggers regenerate suggestion.
- `src/lib/image-studio/provider-manager.ts` — priority list, enable flags, failover logic. Wraps existing `generate-image.ts` providers; adds no new paid providers.
- `src/lib/image-studio/locks.ts` — character + style + background lock state (persisted per-project in existing `store.ts`)
- `src/lib/image-studio/types.ts` — QueueJob, LockState, ProviderConfig, ConsistencyScore, HistoryEntry

### Files modified (minimal)

- `src/routes/visual.tsx` — replace body with `<Navigate to="/image-studio" />` so old bookmarks work
- `src/routeTree.gen.ts` — auto-regenerated
- `src/routes/__root.tsx` — sidebar link "Images" → `/image-studio` (single string change)

### Queue architecture

- Central `queueEngine` singleton (`src/lib/image-studio/queue-engine.ts`)
- Jobs: `{ id, sceneId, status, provider, priority, attempts, lastError, score?, imageUrl? }`
- Persistence: `localStorage["image-studio.queue.v1"]` — writes on every state change
- Runner: `requestIdleCallback`-driven loop, configurable concurrency (default 2)
- Uses existing `src/lib/image-pipeline.ts` + `src/lib/generate-image.ts` for actual generation — no new provider calls
- Tab-independent: runs from a module-level singleton mounted in `__root.tsx` provider (already there via existing `image-queue.ts`)
- On refresh: engine reads localStorage, re-queues everything not `completed`
- Auto-save: each completed job's image URL is written straight into project scene state via existing `store.ts` setters

### Consistency engine

Pure client-side heuristic (no paid calls):
- Character score: compare filename/prompt against locked character name tokens
- Prompt-match score: token overlap between requested prompt and provider echo
- Style / background / lighting: check style-lock tokens are present in final prompt
- Overall = weighted average
- Score < 80 → shows a subtle "Re-generate suggested" pill on the image; user chooses

### Provider manager

- Registry of providers: OpenRouter, Gemini, Grok, Local SDXL, plus a placeholder "Add provider" for future
- Each entry: `{ id, name, enabled, priority, requiresKey, hasKey, model? }`
- Only providers already configured in `apikeys.ts` are wired to real calls; others show a "Add key" CTA
- Failover: on job failure, engine picks next enabled provider by priority
- No automatic paid-provider calls if user hasn't enabled it

### Guarantees

- No modification to Story / Voice / Sync / Research / Timeline routes or their lib files
- No new paid provider added, no automatic key usage
- All queue state persisted; refresh-safe
- All generated images auto-saved to project

### Verification steps I'll run before handing off

1. `tsgo` typecheck
2. Playwright: navigate `/image-studio`, screenshot each tab, verify no console errors
3. Verify `/visual` still resolves (redirect)
4. Confirm Story/Voice/Sync/Research/Timeline routes still mount