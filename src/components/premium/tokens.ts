/**
 * ONE design system for the premium component library.
 *
 * Every premium component pulls spacing, radius and shadow from these maps so
 * the whole library stays perfectly consistent. Change a value here and it
 * updates everywhere.
 *
 * - spacing → internal padding scale (single 4/8-based rhythm)
 * - radius  → corner rounding (driven by the global --radius token)
 * - shadow  → elevation scale (driven by the global --shadow-* tokens)
 */

/** Spacing scale — one padding rhythm shared by every surface. */
export const spacing = {
  xs: "p-2.5",
  sm: "p-3.5",
  md: "p-5",
  lg: "p-7",
  xl: "p-9",
} as const;
export type Spacing = keyof typeof spacing;

/** Gap scale — matches the spacing rhythm for stacks & rows. */
export const gap = {
  xs: "gap-1.5",
  sm: "gap-2.5",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
} as const;
export type Gap = keyof typeof gap;

/** Radius scale — one rounding language across the library. */
export const radius = {
  sm: "rounded-lg",
  md: "rounded-xl",
  lg: "rounded-2xl",
  xl: "rounded-3xl",
  pill: "rounded-full",
} as const;
export type Radius = keyof typeof radius;

/** Elevation scale — one shadow language across the library. */
export const shadow = {
  none: "shadow-none",
  soft: "shadow-soft",
  card: "shadow-card",
  lift: "shadow-lift",
  float: "shadow-float",
  glow: "shadow-glow",
} as const;
export type Shadow = keyof typeof shadow;

/** Shared focus treatment used by every interactive premium component. */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Standard motion curve for the library. */
export const motion = "transition-all duration-300 ease-out";
