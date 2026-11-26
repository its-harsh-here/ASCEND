import Dexie from 'dexie';
import { AscendDB } from '@/db/schema';
import { createSyncCapture } from './middleware';
import { canUndoImport, getImportDecision, importGuestJournal, previewGuestImport, undoGuestImport } from './migrate';

const T = '2026-11-26T10:00:00.000Z';
const quest = (id: string, title = id) => ({ id, title, createdAt: T, updatedAt: T });

let guest: AscendDB;
let account: AscendDB;

beforeEach(async () => {
  for (const n of await Dexie.getDatabaseNames()) await Dexie.delete(n);
  guest = new AscendDB('ascend');
  await guest.open();
  account = new AscendDB('ascend-u-00000000-0000-4000-8000-000000000001');
  account.use(createSyncCapture());
  await account.open();
});
afterEach(() => {
  guest.close();
  account.close();
});

describe('guest → account import', () => {
  it('previews counts and how many records are new to the account', async () => {
    await guest.quests.bulkAdd([quest('g1'), quest('shared')] as never);
    await account.quests.add(quest('shared', 'account version') as never);
    const p = await previewGuestImport(account);
    expect(p).toMatchObject({ hasData: true, counts: { quests: 2 }, newCounts: { quests: 1 } });
  });

  it('reports no data for an empty or missing guest journal', async () => {
    expect((await previewGuestImport(account)).hasData).toBe(false);
  });

  it('imports as a union by id: the account keeps its own version of shared records', async () => {
    await guest.quests.bulkAdd([quest('g1'), quest('shared', 'guest version')] as never);
    await guest.settings.put({ id: 'settings', onboarded: true, playerName: 'Guest' } as never);
    await account.quests.add(quest('shared', 'account version') as never);
    const r = await importGuestJournal(account, 1_000);
    expect(r.snapshot).toBe('ascend-premerge-1000');
    expect((await account.quests.get('g1'))?.title).toBe('g1');
    expect((await account.quests.get('shared'))?.title).toBe('account version');
    // A brand-new account takes the guest settings, so it skips onboarding.
    expect(await account.settings.get('settings')).toMatchObject({ onboarded: true, playerName: 'Guest' });
    // Every imported row is queued for sync.
    expect((await account.outbox.toArray()).some((e) => e.table === 'quests' && e.key === 'g1')).toBe(true);
    // The guest journal is untouched.
    expect(await guest.quests.count()).toBe(2);
    expect((await guest.quests.get('shared'))?.title).toBe('guest version');
  });

  it('an onboarded account keeps its own settings', async () => {
    await guest.settings.put({ id: 'settings', onboarded: true, playerName: 'Guest' } as never);
    await account.settings.put({ id: 'settings', onboarded: true, playerName: 'Account' } as never);
    await importGuestJournal(account);
    expect((await account.settings.get('settings'))?.playerName).toBe('Account');
  });

  it('never duplicates XP for the same source', async () => {
    await guest.xpEvents.add({ id: 'gx', sourceKey: 'achievement:first-quest', amount: 25, kind: 'achievement', date: '2026-11-20', createdAt: T } as never);
    await account.xpEvents.add({ id: 'ax', sourceKey: 'achievement:first-quest', amount: 25, kind: 'achievement', date: '2026-11-25', createdAt: T } as never);
    await importGuestJournal(account);
    expect(await account.xpEvents.where('sourceKey').equals('achievement:first-quest').count()).toBe(1);
  });

  it('undo removes every imported record (keeping settings), and syncs that as deletes', async () => {
    await guest.quests.bulkAdd([quest('g1'), quest('g2')] as never);
    await guest.settings.put({ id: 'settings', onboarded: true, playerName: 'Guest' } as never);
    await account.quests.add(quest('mine') as never);
    await importGuestJournal(account, Date.now());
    expect(await account.quests.count()).toBe(3);
    expect(canUndoImport(await getImportDecision(account))).toBe(true);
    await account.outbox.clear();
    await undoGuestImport(account);
    expect((await account.quests.toArray()).map((q) => q.id)).toEqual(['mine']);
    expect((await account.settings.get('settings'))?.onboarded).toBe(true); // still in the app
    const deletes = (await account.outbox.toArray()).filter((e) => e.op === 'delete').map((e) => e.key).sort();
    expect(deletes).toEqual(['g1', 'g2']);
    expect(await Dexie.exists('ascend-premerge-' + 0)).toBe(false);
    expect((await getImportDecision(account))?.kind).toBe('declined');
  });

  it('undo is offered for 30 days only', () => {
    const at = '2026-11-01T00:00:00.000Z';
    expect(canUndoImport({ kind: 'imported', at, snapshot: 's' }, Date.parse('2026-11-30T00:00:00Z'))).toBe(true);
    expect(canUndoImport({ kind: 'imported', at, snapshot: 's' }, Date.parse('2026-12-02T00:00:00Z'))).toBe(false);
    expect(canUndoImport({ kind: 'declined', at })).toBe(false);
  });
});
