import { HardDriveDownload, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { db, isSyncedDb } from '@/db/schema';
import { declineGuestImport, getImportDecision, importGuestJournal, previewGuestImport, type GuestPreview } from '@/sync/migrate';
import { syncNow, useSyncStatus } from '@/sync/runtime';
import { useUI } from '@/store/ui';

const LABELS: Record<string, string> = {
  campaigns: 'Campaigns', quests: 'Quests', subtasks: 'Subtasks', reviews: 'Reviews', focusSessions: 'Focus sessions',
  xpEvents: 'XP events', achievements: 'Achievements', rewards: 'Rewards', recurrences: 'Recurring quests', timeBlocks: 'Time blocks',
};

/** Summary rows for the preview: only tables with something new to bring over. */
export function previewRows(p: GuestPreview) {
  return Object.entries(p.newCounts).filter(([t, n]) => n && LABELS[t]).map(([t, n]) => ({ table: t, label: LABELS[t], count: n! }));
}

/**
 * Offered once, the first time an account journal is open (after its first pull) while this device's
 * guest journal has data. "Not now" can be undone from Settings → Cloud sync.
 */
export function GuestImportPrompt() {
  const initialPullDone = useSyncStatus((s) => s.initialPullDone);
  const toast = useUI((s) => s.toast);
  const [preview, setPreview] = useState<GuestPreview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSyncedDb() || !initialPullDone) return;
    let live = true;
    void (async () => {
      if (await getImportDecision(db)) return;
      const p = await previewGuestImport(db);
      if (live && p.hasData && previewRows(p).length) setPreview(p);
    })();
    return () => {
      live = false;
    };
  }, [initialPullDone]);

  if (!preview) return null;
  const rows = previewRows(preview);

  const doImport = async () => {
    setBusy(true);
    try {
      const r = await importGuestJournal(db);
      toast({ title: 'Guest journal imported', description: `${r.imported} records added to your account. You can undo this for 30 days in Settings → Cloud sync.`, tone: 'success' });
      setPreview(null);
      void syncNow();
    } catch {
      toast({ title: 'Import failed', description: 'Nothing was changed. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && void declineGuestImport(db).then(() => setPreview(null))}
      title="Bring your guest progress?"
      description="This device has a guest journal. Add it to your account so it syncs everywhere."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => void declineGuestImport(db).then(() => setPreview(null))} disabled={busy} data-testid="import-decline">Not now</Button>
          <Button variant="primary" onClick={() => void doImport()} disabled={busy} data-testid="import-accept">
            {busy ? <Loader2 className="animate-spin" /> : <HardDriveDownload />} Import
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-1.5">
          {rows.map((r) => (
            <div key={r.table} className="flex justify-between rounded-lg border border-line px-2.5 py-1.5 text-xs"><span>{r.label}</span><span className="font-num">{r.count}</span></div>
          ))}
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-fg-muted">
          <li>Nothing in your account is overwritten; records it already has stay as they are.</li>
          <li>The guest journal stays on this device, unchanged.</li>
          <li>Guest XP is imported as local XP; leaderboards only count verified XP earned after you signed up.</li>
          <li>You can undo the import for 30 days.</li>
        </ul>
      </div>
    </Dialog>
  );
}
