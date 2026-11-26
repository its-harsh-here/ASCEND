import type { SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { AscendDB } from '@/db/schema';
import { onCaptured } from './middleware';
import { syncOnce, SyncTransportError, type SyncReport, type SyncTransport } from './engine';
import type { PullPage, PushResult } from './types';

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'auth' | 'upgrade';

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** The first pull for this account database finished (so onboarding can trust "no data"). */
  initialPullDone: boolean;
  lastReport: SyncReport | null;
}

export const useSyncStatus = create<SyncStatus>(() => ({
  phase: 'off', pending: 0, conflicts: 0, lastSyncAt: null, lastError: null, initialPullDone: false, lastReport: null,
}));

function classify(error: { code?: string; message?: string; status?: number } | null | undefined): SyncTransportError {
  const msg = error?.message ?? 'Sync failed';
  if (msg === 'upgrade_required') return new SyncTransportError('upgrade', msg);
  if (error?.code === 'PT429' || msg === 'rate_limited') return new SyncTransportError('rate_limited', msg);
  if (error?.status === 401 || error?.code === 'PGRST301' || error?.code === '28000' || /jwt|not_authenticated/i.test(msg)) return new SyncTransportError('auth', msg);
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg) || globalThis.navigator?.onLine === false) return new SyncTransportError('network', msg);
  return new SyncTransportError('server', msg);
}

export function supabaseTransport(sb: SupabaseClient): SyncTransport {
  return {
    async push(clientSchema, mutations) {
      const { data, error } = await sb.rpc('sync_push', { client_schema: clientSchema, mutations });
      if (error) throw classify(error);
      return (data as { results: PushResult[] }).results;
    },
    async pull(afterSeq, maxRows) {
      const { data, error } = await sb.rpc('sync_pull', { after_seq: afterSeq, max_rows: maxRows });
      if (error) throw classify(error);
      return data as PullPage;
    },
    async refreshAuth() {
      const { data, error } = await sb.auth.refreshSession();
      return !error && !!data.session;
    },
  };
}

export interface SchedulerOptions {
  debounceMs?: number;
  intervalMs?: number;
  /** Base and cap for exponential backoff after failures. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  random?: () => number;
}

/**
 * Runs sync passes for one account database: at start, when the device comes online, 2 s after a
 * local write, every 60 s while the tab is visible, and on demand. One pass at a time across tabs
 * (Web Locks); failures back off exponentially (1 s → 5 min, ±20% jitter).
 */
export class SyncScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private again = false;
  private failures = 0;
  private stopped = false;
  private unsub: (() => void)[] = [];
  private readonly o: Required<SchedulerOptions>;

  constructor(
    private readonly db: AscendDB,
    private readonly transport: SyncTransport,
    opts: SchedulerOptions = {},
  ) {
    this.o = { debounceMs: 2000, intervalMs: 60_000, backoffBaseMs: 1000, backoffMaxMs: 5 * 60_000, random: Math.random, ...opts };
  }

  start(): void {
    this.stopped = false;
    void this.refreshCounts();
    const soon = () => this.schedule(this.o.debounceMs);
    this.unsub.push(onCaptured(soon));
    if (typeof window !== 'undefined') {
      const online = () => this.schedule(0);
      const offline = () => useSyncStatus.setState({ phase: 'offline' });
      const visible = () => document.visibilityState === 'visible' && this.schedule(0);
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      document.addEventListener('visibilitychange', visible);
      this.unsub.push(() => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
        document.removeEventListener('visibilitychange', visible);
      });
    }
    this.interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') this.schedule(0);
    }, this.o.intervalMs);
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    this.unsub.forEach((u) => u());
    this.unsub = [];
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.timer = this.interval = null;
  }

  /** Sync as soon as possible (resets backoff). */
  syncNow(): Promise<void> {
    this.failures = 0;
    return this.run();
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), ms);
  }

  backoffDelay(failures: number): number {
    const raw = Math.min(this.o.backoffMaxMs, this.o.backoffBaseMs * 2 ** Math.max(0, failures - 1));
    return Math.round(raw * (0.8 + this.o.random() * 0.4));
  }

  async refreshCounts(): Promise<void> {
    const [pending, conflicts, lastSyncAt, initialPullDone] = await Promise.all([
      this.db.outbox.count(),
      this.db.syncConflicts.count(),
      this.db.syncState.get('lastSyncAt'),
      this.db.syncState.get('initialPullDone'),
    ]);
    useSyncStatus.setState({
      pending, conflicts,
      lastSyncAt: (lastSyncAt?.value as string | undefined) ?? null,
      initialPullDone: initialPullDone?.value === true,
    });
  }

  private async run(): Promise<void> {
    if (this.stopped) return;
    if (this.running) {
      this.again = true;
      return;
    }
    if (globalThis.navigator?.onLine === false) {
      useSyncStatus.setState({ phase: 'offline' });
      return;
    }
    this.running = true;
    useSyncStatus.setState({ phase: 'syncing' });
    try {
      const pass = () => syncOnce(this.db, this.transport);
      const locks = (globalThis.navigator as Navigator | undefined)?.locks;
      // Another tab holding the lock is syncing this same database: skip, its writes reach us via IndexedDB.
      const report = locks ? await locks.request('ascend-sync', { ifAvailable: true }, (lock) => (lock ? pass() : null)) : await pass();
      this.failures = 0;
      useSyncStatus.setState({ phase: 'idle', lastError: null, ...(report ? { lastReport: report } : {}) });
    } catch (e) {
      const err = e instanceof SyncTransportError ? e : new SyncTransportError('server', e instanceof Error ? e.message : String(e));
      if (err.kind === 'upgrade') {
        useSyncStatus.setState({ phase: 'upgrade', lastError: 'This app version is too old to sync. Reload to update.' });
        this.stop();
      } else if (err.kind === 'auth') {
        useSyncStatus.setState({ phase: 'auth', lastError: 'Your session expired. Sign in again to resume syncing.' });
      } else {
        this.failures++;
        useSyncStatus.setState({ phase: err.kind === 'network' ? 'offline' : 'error', lastError: err.message });
        this.schedule(this.backoffDelay(this.failures));
      }
    } finally {
      this.running = false;
      await this.refreshCounts().catch(() => undefined);
      if (this.again && !this.stopped) {
        this.again = false;
        this.schedule(0);
      }
    }
  }
}

let active: SyncScheduler | null = null;

export function startSync(db: AscendDB, transport: SyncTransport, opts?: SchedulerOptions): SyncScheduler {
  active?.stop();
  active = new SyncScheduler(db, transport, opts);
  active.start();
  return active;
}

export function stopSync(): void {
  active?.stop();
  active = null;
  useSyncStatus.setState({ phase: 'off' });
}

export const syncNow = (): Promise<void> => active?.syncNow() ?? Promise.resolve();
