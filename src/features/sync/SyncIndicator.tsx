import { AlertTriangle, CloudOff, CloudUpload, Cloud, Loader2, LogIn, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip } from '@/components/ui/primitives';
import { isSyncedDb } from '@/db/schema';
import { relativeTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useSyncStatus } from '@/sync/runtime';
import { useSyncCounts } from './useSyncCounts';

/** Top-bar sync state (UI/UX §6). Shown only for account journals; links to Settings → Cloud sync. */
export function SyncIndicator() {
  const { phase, lastSyncAt } = useSyncStatus();
  const { pending, conflicts } = useSyncCounts();
  if (!isSyncedDb() || phase === 'off') return null;

  let icon = <Cloud />;
  let label = 'Synced';
  let detail = lastSyncAt ? `Last synced ${relativeTime(lastSyncAt)}` : 'Up to date';
  let tone = 'text-fg-muted';
  if (phase === 'auth') {
    icon = <LogIn />; label = 'Sign in again'; detail = 'Your session expired. Changes are kept on this device until you sign in.'; tone = 'text-crimson';
  } else if (phase === 'upgrade') {
    icon = <RefreshCcw />; label = 'Update needed'; detail = 'Reload to update the app; syncing resumes after.'; tone = 'text-crimson';
  } else if (conflicts > 0) {
    icon = <AlertTriangle />; label = `${conflicts} to review`; detail = 'Some changes were made on two devices at once. Choose which to keep.'; tone = 'text-gold';
  } else if (phase === 'offline') {
    icon = <CloudOff />; label = pending ? `Offline · ${pending}` : 'Offline'; detail = pending ? `${pending} change${pending === 1 ? '' : 's'} will sync when you’re back online.` : 'Everything is saved on this device.';
  } else if (phase === 'syncing') {
    icon = <Loader2 className="animate-spin" />; label = 'Syncing';
  } else if (phase === 'error') {
    icon = <AlertTriangle />; label = pending ? `${pending} pending` : 'Retrying'; detail = 'Sync hit a problem and will retry automatically. Your data is safe on this device.'; tone = 'text-gold';
  } else if (pending > 0) {
    icon = <CloudUpload />; label = `${pending} pending`; detail = `${pending} change${pending === 1 ? '' : 's'} waiting to sync.`;
  }

  return (
    <Tooltip content={detail}>
      <Link
        to="/settings#sync"
        className={cn('flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold hover:bg-surface-2 [&_svg]:size-4', tone)}
        aria-label={`Cloud sync: ${label}. ${detail}`}
        data-testid="sync-indicator"
        data-phase={phase}
      >
        {icon}
        <span className="hidden sm:inline">{label}</span>
      </Link>
    </Tooltip>
  );
}
