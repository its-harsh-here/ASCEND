// Edge Function: permanently delete the caller's account (ADR-006, SECURITY §5).
// Runs with the service-role key, which exists only in the Supabase runtime — never in the browser.
// Requires a sign-in within the last 5 minutes (the app forces a fresh Google login first).
// No npm dependencies: two plain calls to the Auth REST API, so no third-party code ever holds the service key.
import { decodeJwtPayload, isFreshAuth } from './freshness.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Verifies the token with Auth (signature, expiry, user still exists) and returns the user id. */
async function verifiedUserId(token: string): Promise<string | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY } });
  if (!r.ok) return null;
  const user = (await r.json()) as { id?: string };
  return typeof user.id === 'string' ? user.id : null;
}

async function deleteUser(id: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  return r.ok;
}

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://its-harsh-here.github.io,http://localhost:4173,http://localhost:4174,http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token) return json(req, 401, { error: 'not_authenticated' });

  // Verifies the signature and that the user still exists.
  const userId = await verifiedUserId(token);
  if (!userId) return json(req, 401, { error: 'not_authenticated' });

  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(token);
  } catch {
    return json(req, 401, { error: 'not_authenticated' });
  }
  if (claims.sub !== userId || !isFreshAuth(claims, Math.floor(Date.now() / 1000))) {
    return json(req, 403, { error: 'reauth_required' });
  }

  // auth.users → profiles (and, from P3, every synced table) cascade on delete.
  if (!(await deleteUser(userId))) return json(req, 500, { error: 'delete_failed' });

  return new Response(null, { status: 204, headers: cors(req) });
});
