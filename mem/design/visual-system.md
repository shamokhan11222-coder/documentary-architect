---
name: Stickmax visual system
description: Premium dark-first design direction — Midnight Indigo palette, Syne + Plus Jakarta Sans
type: design
---
Premium AI-OS aesthetic (Cursor / Linear / Raycast / ElevenLabs / Framer feel).
- Dark-first (default theme "dark"); light optional.
- Palette: Midnight Indigo — bg deep navy, electric indigo brand #6d6afe (dark) / #4f46e5 (light).
- Fonts: General Sans (display/headings, Fontshare) + Inter (body, Google), loaded via <link> in __root head. No heavy 800 weights; headings 600, generous letter/line spacing — premium SaaS feel.
- Tokens live in src/styles.css :root/.dark; never hardcode colors in components.
- Redesign UX/hierarchy only — do not change functionality.
- Brand: "Stickmax" (app = "Stickmax Studio"), domain stickmax.io. Logo = minimal bold stickman in a confident victory stance inside a blue→indigo gradient squircle (#63A4FF→#3568FF→#4B45E6); white figure. Same mark in src/components/Logo.tsx, public/favicon.svg, public/app-icon.svg — keep all three in sync. Wordmark font-semibold (no heavy bold).
