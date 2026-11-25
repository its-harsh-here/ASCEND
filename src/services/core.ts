import { db } from '@/db/schema';
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@/domain/types';
import { todayKey } from '@/lib/dates';
import { nowIso, uid } from '@/lib/utils';

export async function getSettings(): Promise<Settings> {
  const raw = await db.settings.get('settings');
  if (!raw) return DEFAULT_SETTINGS;
  const parsed = settingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS, ...raw };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    const next = settingsSchema.parse({ ...current, ...patch, id: 'settings', createdAt: current.createdAt ?? nowIso() });
    await db.settings.put(next);
    return next;
  });
}

export async function logActivity(type: string, message: string, entityId?: string): Promise<void> {
  await db.activity.add({ id: uid(), type, message, entityId, date: todayKey(), createdAt: nowIso() });
}

/** Ask the browser to protect our storage from eviction (best effort; browsers may decline). */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean | null } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted };
  } catch {
    return null;
  }
}
