import Dexie from 'dexie';
import { AlertTriangle, CloudOff, HardDriveDownload, Loader2, RefreshCcw, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/primitives';
import { signOut, useSession } from '@/cloud/session';
import { getSupabase } from '@/cloud/supabase';
import { db } from '@/db/schema';
import { ConflictReview } from '@/features/sync/ConflictReview';
import { useSyncCounts } from '@/features/sync/useSyncCounts';
import { relativeTime } from '@/lib/dates';
import { canUndoImport, getImportDecision, importGuestJournal, previewGuestImport, undoGuestImport, type ImportDecision } from '@/sync/migrate';
import { syncNow, useSyncStatus } from '@/sync/runtime';
import { useUI } from '@/store/ui';
import { Row, Section } from './layout';

interface ServerStatus {
  records: number;
  bytes: number;
  quota_records: number;
}

const PHASE_TEXT: Record<string, string> = {
  idle: 'Up to date', syncing: 'Syncing…', offline: 'Offline — changes are saved on this device', error: 'Retrying after an error',
  auth: 'Paused — sign in again', upgrade: 'Paused — reload to update the app', off: 'Not running',
};

export function SyncSection() {
  const status = { ...useSyncStatus(), ...useSyncCounts() };
  const user = useSession((s) => s.user);
  const toast = useUI((s) => s.toast);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [review, setReview] = useState(false);
  const [decision, setDecision] = useState<ImportDecision | null>(null);
  const [guestNew, setGuestNew] = useState(0);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setDecision(await getImportDecision(db));
    const p = await previewGuestImport(db);
    setGuestNew(Object.values(p.newCounts).reduce((a, n) => a + (n ?? 0), 0));
    const sb = await getSupabase();
    const { data } = (await sb?.rpc('sync_status')) ?? { data: null };
    if (data) setServer(data as ServerStatus);
  };
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [status.lastSyncAt]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ title: ok, tone: 'success' });
      void syncNow();
      await refresh();
    } catch (e) {
      toast({ title: 'That didn’t work', description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const removeDeviceData = async () => {
    if (!user) return;
    setBusy(true);
    const name = db.name;
    await signOut(); // switches this tab back to the guest journal (reload)
    db.close();
    await Dexie.delete(name).catch(() => undefined);
  };

  return (
    <Section id="sync" title="Cloud sync" description="Your account journal syncs between your devices. Everything also works offline; changes sync when you’re back.">
      <Row label="Status" hint={status.lastSyncAt ? `Last synced ${relativeTime(status.lastSyncAt)}` : 'Not synced yet'}>
        <span className="flex items-center gap-2 text-sm" data-testid="sync-status-text">
          {status.phase === 'syncing' && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {status.phase === 'offline' && <CloudOff className="size-4" aria-hidden />}
          {PHASE_TEXT[status.phase] ?? status.phase}
        </span>
      </Row>
      <Row label="Waiting to sync" hint="Changes made on this device that the server hasn’t confirmed yet.">
        <Badge tone={status.pending ? 'gold' : 'neutral'} data-testid="sync-pending">{status.pending}</Badge>
      </Row>
      <Row label="Conflicts" hint="Edited on two devices before they could sync.">
        {status.conflicts ? (
          <Button size="sm" onClick={() => setReview(true)} data-testid="sync-review"><AlertTriangle /> Review {status.conflicts}</Button>
        ) : (
          <Badge>None</Badge>
        )}
      </Row>
      {server && (
        <Row label="Cloud storage" hint="Free tier: a fair-use cap per account.">
          <span className="font-num text-sm">{server.records.toLocaleString()} / {server.quota_records.toLocaleString()} records · {(server.bytes / 1024).toFixed(0)} KB</span>
        </Row>
      )}
      <Row label="Sync now">
        <Button size="sm" onClick={() => void syncNow()} disabled={status.phase === 'syncing'} data-testid="sync-now"><RefreshCcw /> Sync now</Button>
      </Row>
      {decision?.kind !== 'imported' && guestNew > 0 && (
        <Row label="Guest journal on this device" hint={`${guestNew} records aren’t in your account yet.`}>
          <Button size="sm" onClick={() => void run(() => importGuestJournal(db), 'Guest journal imported')} disabled={busy} data-testid="sync-import"><HardDriveDownload /> Import</Button>
        </Row>
      )}
      {canUndoImport(decision) && (
        <Row label="Undo guest import" hint={`Imported ${relativeTime(decision.at)}. Removes the imported records on every device.`}>
          <Button size="sm" variant="ghost" onClick={() => void run(() => undoGuestImport(db), 'Import undone')} disabled={busy} data-testid="sync-undo-import"><Undo2 /> Undo</Button>
        </Row>
      )}
      <Row label="Remove from this device" hint="Signs out and deletes this account’s journal from this device only. Your cloud copy is kept.">
        <Button size="sm" variant="danger" onClick={() => setRemoveOpen(true)} data-testid="sync-remove-device"><Trash2 /> Remove</Button>
      </Row>

      <ConflictReview open={review} onOpenChange={setReview} />
      <Dialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove this account from this device?"
        description="Your journal stays in the cloud and on your other devices. Sign in again any time to download it."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => void removeDeviceData()} disabled={busy} data-testid="sync-remove-confirm">Remove</Button>
          </>
        }
      >
        {status.pending > 0 && (
          <p role="alert" className="text-sm text-crimson">
            {status.pending} change{status.pending === 1 ? ' hasn’t' : 's haven’t'} synced yet and will be lost. Sync first if you can.
          </p>
        )}
      </Dialog>
    </Section>
  );
}
