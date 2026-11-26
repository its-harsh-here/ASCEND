#!/usr/bin/env node
// Fails if a colour literal appears in component code. Theme colours live in src/styles/index.css as tokens,
// so light/dark/accent switching works everywhere. A file can opt out with a `color-literals: allow — <reason>`
// comment (e.g. avatar artwork that is deliberately theme-independent).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b(?![-\w])/g, // #fff, #1b1305, #ffffff80
  /\brgba?\(\s*\d/g, // rgb(3 3 8 / .7), rgba(0,0,0,.5)
  /\brgb\(\d+_\d+_\d+/g, // Tailwind arbitrary value rgb(255_255_255/0.35)
  /\bhsla?\(\s*\d/g,
];
const ALLOW = /color-literals:\s*allow\b/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.(test|spec|spike\.test)\.[tj]sx?$/.test(name)) yield p;
  }
}

const hits = [];
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  if (ALLOW.test(text)) continue;
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, ''); // ignore line comments
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      const m = re.exec(code);
      if (m) hits.push(`${relative(ROOT, file)}:${i + 1}: ${m[0]}  →  use a token from src/styles/index.css`);
    }
  });
}

if (hits.length) {
  console.error(`Colour literals found (${hits.length}):\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('check-color-literals: no colour literals outside src/styles.');
