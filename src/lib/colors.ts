/**
 * Named colour swatches used for campaign banners and accent pickers.
 * Values live in CSS (`--swatch-<name>` in src/styles/index.css) so each theme can tune them;
 * components only ever reference the variables.
 */
export const SWATCHES = ['violet', 'cyan', 'gold', 'emerald', 'rose', 'indigo'] as const;
export type Swatch = (typeof SWATCHES)[number];

function normalize(name: string): Swatch {
  return (SWATCHES as readonly string[]).includes(name) ? (name as Swatch) : 'violet';
}

/** `var(--swatch-<name>)`, falling back to violet for unknown names (e.g. data from old backups). */
export function swatch(name: string): string {
  return `var(--swatch-${normalize(name)})`;
}

/** The swatch at `percent`% opacity, via color-mix (works with CSS variables, unlike hex alpha suffixes). */
export function swatchAlpha(name: string, percent: number): string {
  return `color-mix(in oklab, ${swatch(name)} ${percent}%, transparent)`;
}
