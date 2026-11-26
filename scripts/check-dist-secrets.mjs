#!/usr/bin/env node
// Fails the build if a privileged Supabase credential ended up in the shipped bundle.
// Catches: new-style secret keys (sb_secret_…), and any JWT whose payload role is service_role
// (legacy keys are base64 JWTs, so the text "service_role" never appears literally).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;
const JWT = /eyJ[\w-]{10,}\.(eyJ[\w-]{10,})\.[\w-]{10,}/g;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|html|json|webmanifest|map|txt)$/.test(name)) yield p;
  }
}

const problems = [];
for (const file of walk(DIST)) {
  const text = readFileSync(file, 'utf8');
  const where = relative(DIST, file);
  if (/sb_secret_[\w-]+/.test(text)) problems.push(`${where}: contains an sb_secret_ key`);
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role' || payload.role === 'supabase_admin') problems.push(`${where}: contains a ${payload.role} JWT`);
    } catch {
      /* not a JWT */
    }
  }
}

if (problems.length) {
  console.error(`Privileged credentials found in dist/ — never ship these:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('check-dist-secrets: no privileged keys in dist/.');
