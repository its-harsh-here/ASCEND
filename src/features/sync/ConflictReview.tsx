import { useLiveQuery } from 'dexie-react-hooks';
import { ArchiveRestore, Check, Lock, Pencil, Smartphone, Cloud } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Textarea } from '@/components/ui/primitives';
import { db } from '@/db/schema';
import { keepMine, keepTheirs, saveMerged } from '@/sync/engine';
import { syncNow } from '@/sync/runtime';
import type { SyncConflict } from '@/sync/types';

const TABLE_LABEL: Record<string, string> = {
  quests: 'Quest', campaigns: 'Campaign', reviews: 'Review', milestones: 'Milestone', questlines: 'Questline',
  subtasks: 'Subtask', settings: 'Settings', recurrences: 'Recurring quest', timeBlocks: 'Time block', rewards: 'Reward',
};

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

function Version({ who, value, icon }: { who: string; value: unknown; icon: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-wide text-fg-muted uppercase [&_svg]:size-3.5">{icon}{who}</div>
      <p className="text-sm break-words whitespace-pre-wrap">{show(value)}</p>
    </div>
  );
}

function ConflictCard({ c }: { c: SyncConflict }) {
  const record = useLiveQuery(() => (c.table in db ? db.table(c.table).get(c.recordId) : undefined), [c.table, c.recordId]) as Record<string, unknown> | undefined;
  const [editing, setEditing] = useState(false);
  const [merged, setMerged] = useState(() => [show(c.theirs), show(c.mine)].filter((x) => x !== '—').join('\n\n'));
  const name = (record?.title ?? record?.name ?? (c.mine as Record<string, unknown> | null)?.title ?? c.recordId) as string;
  const done = async (fn: () => Promise<void>) => {
    await fn();
    void syncNow();
  };

  return (
    <li className="rounded-xl border border-line p-4" data-testid="conflict">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge>{TABLE_LABEL[c.table] ?? c.table}</Badge>
        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
        {c.field && <span className="text-xs text-fg-muted">· {c.field}</span>}
      </div>

      {c.kind === 'deleted' ? (
        <>
          <p className="mb-3 text-sm text-fg-muted">This was deleted on another device while you were editing it here. Deletions win unless you restore it.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => void done(() => keepMine(db, c))} data-testid="conflict-restore"><ArchiveRestore /> Restore with my changes</Button>
            <Button size="sm" variant="ghost" onClick={() => void done(() => keepTheirs(db, c))}>Keep it deleted</Button>
          </div>
        </>
      ) : c.kind === 'locked' ? (
        <>
          <p className="mb-3 flex items-start gap-2 text-sm text-fg-muted"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden />The deadline is locked, so your change to it wasn’t applied. Unlock the deadline first if you really want to move it.</p>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Version who="Kept (locked)" value={c.theirs} icon={<Lock />} />
            <Version who="Your change" value={c.mine} icon={<Smartphone />} />
          </div>
          <Button size="sm" onClick={() => void done(() => keepTheirs(db, c))}><Check /> OK</Button>
        </>
      ) : editing ? (
        <>
          <label className="mb-1 block text-xs font-semibold text-fg-muted" htmlFor={`merge-${c.id}`}>Merged version</label>
          <Textarea id={`merge-${c.id}`} value={merged} onChange={(e) => setMerged(e.target.value)} className="mb-3 min-h-32" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => void done(() => saveMerged(db, c, merged))}>Save merged</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Version who="Other device (kept for now)" value={c.theirs} icon={<Cloud />} />
            <Version who="This device" value={c.mine} icon={<Smartphone />} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void done(() => keepTheirs(db, c))} data-testid="conflict-keep-theirs">Keep other device’s</Button>
            <Button size="sm" onClick={() => void done(() => keepMine(db, c))} data-testid="conflict-keep-mine">Keep mine</Button>
            {c.kind === 'text' && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil /> Edit merged</Button>}
          </div>
        </>
      )}
    </li>
  );
}

export function ConflictReview({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const conflicts = useLiveQuery(() => db.syncConflicts.orderBy('createdAt').toArray(), []) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Review sync conflicts" description="These were changed on two devices before they could sync. Nothing is lost: choose which version to keep." size="lg">
      {conflicts.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-muted">All clear — nothing to review.</p>
      ) : (
        <ul className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">{conflicts.map((c) => <ConflictCard key={c.id} c={c} />)}</ul>
      )}
    </Dialog>
  );
}
