/**
 * WCAG 2.2 contrast checks computed directly from the design tokens in index.css,
 * for both themes and every accent. Fails the build if a token change breaks AA.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

/** Collect `--name: value;` declarations from the first block whose selector matches exactly. */
function block(selector: string): Record<string, string> {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`selector not found: ${selector}`);
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const ACCENTS = ['violet', 'cyan', 'gold', 'emerald', 'rose', 'indigo'] as const;
type Theme = 'dark' | 'light';

function tokens(theme: Theme, accent: (typeof ACCENTS)[number]): Record<string, string> {
  let t = { ...block(':root, .theme-dark') };
  if (accent !== 'violet') t = { ...t, ...block(`:root[data-accent='${accent}']`) };
  if (theme === 'light') t = { ...t, ...block(':root.light, .theme-light') };
  if (theme === 'light' && accent !== 'violet' && css.includes(`:root.light[data-accent='${accent}'] {`)) {
    t = { ...t, ...block(`:root.light[data-accent='${accent}']`) };
  }
  return t;
}

type RGBA = [number, number, number, number];
function parse(value: string, t: Record<string, string>, depth = 0): RGBA {
  const v = value.trim();
  if (depth > 10) throw new Error(`var cycle at ${value}`);
  const varRef = /^var\((--[\w-]+)\)$/.exec(v);
  if (varRef) return parse(t[varRef[1]] ?? (() => { throw new Error(`undefined ${varRef[1]}`); })(), t, depth + 1);
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return [0, 2, 4].map((o) => parseInt(hex[1].slice(o, o + 2), 16)).concat(1) as RGBA;
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(v);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`unsupported color: ${value}`);
}

function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function luminance([r, g, b]: RGBA): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(fgToken: string, bgToken: string, t: Record<string, string>): number {
  const bg = parse(`var(${bgToken})`, t);
  const fg = over(parse(`var(${fgToken})`, t), bg);
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const SURFACES = ['--bg', '--surface', '--surface-2'];
const TEXT = ['--fg', '--fg-muted', '--fg-dim'];
const COLORED_TEXT = ['--c-violet', '--c-cyan', '--c-gold', '--c-emerald', '--c-crimson', '--accent'];

describe.each(['dark', 'light'] as Theme[])('contrast — %s theme', (theme) => {
  const t = tokens(theme, 'violet');

  it.each(TEXT.flatMap((fg) => SURFACES.map((bg) => [fg, bg])))('text %s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(fg, bg, t)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(COLORED_TEXT.flatMap((fg) => ['--surface', '--surface-2'].map((bg) => [fg, bg])))(
    'colored text %s on %s ≥ 4.5:1',
    (fg, bg) => {
      expect(contrast(fg, bg, t)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(ACCENTS)('accent "%s": button label (--accent-fg on --accent) ≥ 4.5:1 and focus ring vs --surface ≥ 3:1', (accent) => {
    const ta = tokens(theme, accent);
    expect(contrast('--accent-fg', '--accent', ta)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('--accent', '--surface', ta)).toBeGreaterThanOrEqual(3);
  });

  // The primary button is linear-gradient(color-mix(--accent 92%, white), --accent-2); the label sits mid-gradient.
  it.each(ACCENTS)('accent "%s": primary button label on the gradient midpoint ≥ 4.5:1', (accent) => {
    const ta = tokens(theme, accent);
    const top = over([...parse('var(--accent)', ta).slice(0, 3), 0.92] as RGBA, [255, 255, 255, 1]);
    const bottom = parse('var(--accent-2)', ta);
    const mid: RGBA = [(top[0] + bottom[0]) / 2, (top[1] + bottom[1]) / 2, (top[2] + bottom[2]) / 2, 1];
    const label = parse('var(--accent-fg)', ta);
    const [x, y] = [luminance(label), luminance(mid)].sort((p, q) => q - p);
    expect((x + 0.05) / (y + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  // Tag chips: text-<colour> on bg-[color-mix(<colour> 12%, transparent)] over a surface (e.g. quest-card skill tags).
  it.each(['--c-violet', '--c-cyan', '--c-gold', '--c-emerald', '--c-crimson', '--c-indigo'])('chip text %s on its own 12%% tint ≥ 4.5:1', (c) => {
    const t = tokens(theme, 'violet');
    const fg = parse(`var(${c})`, t);
    for (const surface of ['--bg', '--surface', '--surface-2']) {
      const bg = over([fg[0], fg[1], fg[2], 0.12], parse(`var(${surface})`, t));
      const [x, y] = [luminance(fg), luminance(bg)].sort((p, q) => q - p);
      expect((x + 0.05) / (y + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Gold button: linear-gradient(--gold-hi, --c-gold 55%, --gold-lo). The label spans roughly 30–70% of the height,
  // so check the ink against --c-gold and the two points where that band meets the gradient.
  it('gold button ink on the gold gradient ≥ 4.5:1', () => {
    const t = tokens(theme, 'violet');
    const ink = luminance(parse('var(--gold-ink)', t));
    const [hi, gold, lo] = ['--gold-hi', '--c-gold', '--gold-lo'].map((k) => parse(`var(${k})`, t));
    const mix = (a: RGBA, b: RGBA, w: number): RGBA => [a[0] * (1 - w) + b[0] * w, a[1] * (1 - w) + b[1] * w, a[2] * (1 - w) + b[2] * w, 1];
    for (const bg of [mix(hi, gold, 30 / 55), gold, mix(gold, lo, 15 / 45)]) {
      const [x, y] = [ink, luminance(bg)].sort((p, q) => q - p);
      expect((x + 0.05) / (y + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
