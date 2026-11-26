/**
 * P3-15 chaos property test — runs against the LOCAL Supabase stack (vitest.cloud.config.ts).
 *
 * For each seed: one account, two devices (separate IndexedDB databases with the capture middleware),
 * 200 random operations — create / edit scalar / edit text / delete / sync — with the network randomly
 * failing BEFORE a request or AFTER the server applied it (the reply is lost, so the client retries an
 * already-applied push). After a final clean sync, both devices and the server must hold the same records.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Dexie from 'dexie';
import { AscendDB } from '@/db/schema';
import { syncOnce, SyncTransportError, type SyncTransport } from './engine';
import { createSyncCapture } from './middleware';
import { fromCloud } from './tables';
import { DIFFICULTIES, PRIORITIES, questSchema } from '@/domain/types';
import { supabaseTransport } from './runtime';

const API = 'http://127.0.0.1:54321';
const ANON = process.env.SB_ANON_KEY ?? '';
const SERVICE = process.env.SB_SERVICE_ROLE_KEY ?? '';
const SEEDS = Number(process.env.CHAOS_SEEDS ?? 50);
const OPS = Number(process.env.CHAOS_OPS ?? 200);

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function signedInClient(email: string, password: string): Promise<SupabaseClient> {
  const sb = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false, storageKey: `chaos-${Math.random()}` } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return sb;
}

/** Network that fails at random: before sending (nothing happened) or after the server applied it (reply lost). */
function flaky(inner: SyncTransport, rnd: () => number, p: number): SyncTransport & { enabled: boolean } {
  const t = {
    enabled: true,
    async push(s: number, m: unknown[]) {
      if (t.enabled && rnd() < p) throw new SyncTransportError('network', 'dropped before send');
      const r = await inner.push(s, m);
      if (t.enabled && rnd() < p) throw new SyncTransportError('network', 'reply lost');
      return r;
    },
    async pull(a: number, n: number) {
      if (t.enabled && rnd() < p) throw new SyncTransportError('network', 'dropped before send');
      const r = await inner.pull(a, n);
      if (t.enabled && rnd() < p) throw new SyncTransportError('network', 'reply lost');
      return r;
    },
    refreshAuth: () => inner.refreshAuth(),
  };
  return t;
}

const T0 = Date.parse('2026-11-26T00:00:00Z');



type Q = Record<string, unknown>;
const canon = (rows: Q[]) => JSON.stringify(rows.map((r) => Object.fromEntries(Object.entries(r).sort())).sort((a, b) => String(a.id).localeCompare(String(b.id))));

describe.skipIf(!ANON || !SERVICE)('chaos: two devices converge', () => {
  const admin = createClient(API, SERVICE, { auth: { persistSession: false } });
  const results: { seed: number; ops: number; conflicts: number; ms: number }[] = [];
  const pushMs: number[] = []; // P3 exit metric: push → ack round trip (successful pushes only)
  const timed = (t: SyncTransport): SyncTransport => ({
    ...t,
    async push(s, m) {
      const t0 = performance.now();
      const r = await t.push(s, m);
      pushMs.push(performance.now() - t0);
      return r;
    },
  });

  afterAll(() => {
    const total = results.reduce((a, r) => a + r.ms, 0);
    const sorted = [...pushMs].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]?.toFixed(1);
    console.log(`push→ack over ${sorted.length} pushes: p50 ${pct(50)} ms, p95 ${pct(95)} ms, max ${sorted.at(-1)?.toFixed(1)} ms`);
    console.log(`chaos: ${results.length} seeds × ${OPS} ops converged; ${results.reduce((a, r) => a + r.conflicts, 0)} conflicts recorded; ${Math.round(total / 1000)} s total`);
  });

  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`seed ${seed}`, async () => {
      const started = Date.now();
      const rnd = mulberry32(seed);
      const email = `chaos-${seed}-${Date.now()}@example.test`;
      const password = 'chaos-Passw0rd!';
      const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;

      const devices = await Promise.all(
        ['a', 'b'].map(async (name) => {
          const dbName = `ascend-u-chaos-${seed}-${name}`;
          await Dexie.delete(dbName);
          const db = new AscendDB(dbName);
          db.use(createSyncCapture());
          await db.open();
          const net = flaky(timed(supabaseTransport(await signedInClient(email, password))), rnd, 0.15);
          return { db, net };
        }),
      );

      let n = 0;
      let clock = 0;
      const ts = () => new Date(T0 + ++clock * 1000).toISOString();
      for (let i = 0; i < OPS; i++) {
        const d = devices[rnd() < 0.5 ? 0 : 1];
        const ids = (await d.db.quests.toCollection().primaryKeys()) as string[];
        const pick = ids[Math.floor(rnd() * ids.length)];
        const r = rnd();
        if (r < 0.22 || ids.length === 0) {
          await d.db.quests.add(questSchema.parse({ id: `q${seed}-${++n}`, title: `Quest ${n}`, createdAt: ts(), updatedAt: ts() })); // as the app writes them: schema-valid
        } else if (r < 0.5) {
          await d.db.quests.update(pick, { priority: PRIORITIES[Math.floor(rnd() * PRIORITIES.length)], updatedAt: ts() });
        } else if (r < 0.62) {
          await d.db.quests.update(pick, { difficulty: DIFFICULTIES[Math.floor(rnd() * DIFFICULTIES.length)], updatedAt: ts() });
        } else if (r < 0.74) {
          await d.db.quests.update(pick, { notes: `notes ${i} from ${d === devices[0] ? 'A' : 'B'}`, updatedAt: ts() });
        } else if (r < 0.8) {
          await d.db.quests.update(pick, { title: `Renamed ${i}`, updatedAt: ts() });
        } else if (r < 0.86) {
          await d.db.quests.delete(pick);
        } else {
          await syncOnce(d.db, d.net).catch((e) => {
            if (!(e instanceof SyncTransportError)) throw e; // only simulated network failures are acceptable
          });
        }
      }

      // Heal the network, then sync until both outboxes are empty and a final pull changes nothing.
      for (const d of devices) d.net.enabled = false;
      for (let round = 0; round < 4; round++) for (const d of devices) await syncOnce(d.db, d.net);
      for (const d of devices) expect(await d.db.outbox.count()).toBe(0);

      const [a, b] = await Promise.all(devices.map((d) => d.db.quests.toArray() as Promise<Q[]>));
      const server = await admin.from('synced_records').select('data').eq('user_id', u.user.id).eq('tbl', 'quests').is('deleted_at', null);
      if (server.error) throw server.error;
      const explain = (x: Q[], y: Q[], lx: string, ly: string) => {
        const mx = new Map(x.map((r) => [String(r.id), r]));
        const my = new Map(y.map((r) => [String(r.id), r]));
        const out: string[] = [];
        for (const id of new Set([...mx.keys(), ...my.keys()])) {
          const rx = mx.get(id), ry = my.get(id);
          if (!rx || !ry) { out.push(`${id}: only in ${rx ? lx : ly}`); continue; }
          for (const k of new Set([...Object.keys(rx), ...Object.keys(ry)])) {
            if (JSON.stringify(rx[k]) !== JSON.stringify(ry[k])) out.push(`${id}.${k}: ${lx}=${JSON.stringify(rx[k])} ${ly}=${JSON.stringify(ry[k])}`);
          }
        }
        return out.join('\n');
      };
      const invalid = (server.data ?? []).filter((r) => fromCloud('quests', r.data as Q) === null);
      if (invalid.length) console.log(`seed ${seed} INVALID server rows: ${JSON.stringify(invalid.map((r) => r.data))}`);
      const serverRows = (server.data ?? []).map((r) => fromCloud('quests', r.data as Q) as Q).filter(Boolean);
      if (canon(a) !== canon(b) || canon(a) !== canon(serverRows)) {
        console.log(`seed ${seed} A vs B:\n${explain(a, b, 'A', 'B')}\nA vs server:\n${explain(a, serverRows, 'A', 'S')}`);
      }
      expect(canon(a)).toBe(canon(b));
      expect(invalid).toEqual([]);
      expect(canon(a)).toBe(canon(serverRows));

      const conflicts = (await devices[0].db.syncConflicts.count()) + (await devices[1].db.syncConflicts.count());
      results.push({ seed, ops: OPS, conflicts, ms: Date.now() - started });
      for (const d of devices) {
        d.db.close();
        await Dexie.delete(d.db.name);
      }
      await admin.auth.admin.deleteUser(u.user.id);
    }, 120_000);
  }
});
