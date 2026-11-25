import { ArrowRight, CalendarClock, Lock, RefreshCcw, Scissors, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Field, Input, Switch } from '@/components/ui/primitives';
import type { Campaign, Milestone, Quest } from '@/domain/types';
import { useToday } from '@/hooks/data';
import { formatDateKey } from '@/lib/dates';
import { previewReschedule, type ReschedulePreview } from '@/planning/rescheduler';
import { applyReschedule, commitmentsExcluding } from '@/services/campaigns';
import { useUI } from '@/store/ui';

/** Smart rescheduling: preview before/after, require explicit confirmation, never move locked deadlines. */
export function RescheduleDialog({ open, onOpenChange, campaign, quests, milestones }: { open: boolean; onOpenChange: (v: boolean) => void; campaign: Campaign; quests: Quest[]; milestones: Milestone[] }) {
  const today = useToday();
  const toast = useUI((s) => s.toast);
  const [dropOptional, setDropOptional] = useState(false);
  const [endDate, setEndDate] = useState(campaign.endDate);
  const [hours, setHours] = useState(campaign.hoursPerDay);
  const [commitments, setCommitments] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!open) return;
    setEndDate(campaign.endDate);
    setHours(campaign.hoursPerDay);
    void commitmentsExcluding(campaign.id, today).then(setCommitments);
  }, [open, campaign, today]);

  const preview: ReschedulePreview | null = useMemo(
    () => (commitments ? previewReschedule(campaign, quests, milestones, { today, commitments, dropOptional, endDate, hoursPerDay: hours }) : null),
    [commitments, campaign, quests, milestones, today, dropOptional, endDate, hours],
  );
  const lockedCount = quests.filter((q) => q.deadlineLocked).length + milestones.filter((m) => m.deadlineLocked).length;

  const apply = async () => {
    if (!preview) return;
    await applyReschedule(campaign, preview);
    toast({ title: 'Campaign rebalanced', description: `${preview.moves.length} quests moved${preview.dropped.length ? `, ${preview.dropped.length} optional skipped` : ''}.`, tone: 'success' });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Rebalance remaining schedule"
      description="Unfinished quests are redistributed from today across available days, keeping dependencies and priorities. Nothing changes until you confirm."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void apply()} disabled={!preview || (preview.moves.length === 0 && preview.dropped.length === 0)} data-testid="apply-reschedule">
            <RefreshCcw /> Apply changes
          </Button>
        </>
      }
    >
      {!preview ? <p className="py-8 text-center text-sm text-fg-dim">Calculating…</p> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface-2/60 p-3"><div className="eyebrow">Missed</div><div className="font-num text-2xl font-semibold text-crimson">{preview.missed.length}</div></div>
            <div className="rounded-xl border border-line bg-surface-2/60 p-3"><div className="eyebrow">Will move</div><div className="font-num text-2xl font-semibold text-accent">{preview.moves.length}</div></div>
            <div className="rounded-xl border border-line bg-surface-2/60 p-3"><div className="eyebrow">Locked deadlines</div><div className="flex items-center gap-1.5 font-num text-2xl font-semibold text-gold"><Lock className="size-4" />{lockedCount}</div></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Campaign end date" htmlFor="rs-end"><Input id="rs-end" type="date" value={endDate} min={today} onChange={(e) => setEndDate(e.target.value || campaign.endDate)} /></Field>
            <Field label="Hours per day" htmlFor="rs-h"><Input id="rs-h" type="number" min={0.5} max={16} step={0.5} value={hours} onChange={(e) => setHours(Math.max(0.5, Number(e.target.value) || campaign.hoursPerDay))} /></Field>
            <label className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 text-sm"><span className="flex items-center gap-2"><Scissors className="size-4 text-cyan" /> Skip optional quests</span><Switch checked={dropOptional} onCheckedChange={setDropOptional} /></label>
          </div>
          {preview.unscheduled.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-crimson/30 bg-[color-mix(in_oklab,var(--c-crimson)_6%,transparent)] p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-crimson" />
              <div><b>{preview.unscheduled.length} quests still don’t fit</b> before {formatDateKey(endDate)}. Suggestions: extend the end date, add daily time, or skip optional quests. They will stay unscheduled rather than overloading you.</div>
            </div>
          )}
          {preview.violations.length > 0 && (
            <div className="rounded-xl border border-gold/30 p-3 text-sm text-gold">{preview.violations.length} locked deadline(s) can no longer be met — locked dates are never moved automatically. Adjust scope or time, or unlock them manually.</div>
          )}
          <div>
            <div className="eyebrow mb-2">Before → after</div>
            <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line" data-testid="reschedule-preview">
              {preview.moves.length === 0 && preview.dropped.length === 0 && <p className="p-4 text-center text-sm text-fg-dim">The schedule is already balanced.</p>}
              {preview.moves.map((m) => (
                <div key={m.questId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <CalendarClock className="size-3.5 shrink-0 text-fg-dim" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span className={m.from && m.from < today ? 'text-crimson' : 'text-fg-muted'}>{m.from ? formatDateKey(m.from, 'MMM d') : '—'}</span>
                  <ArrowRight className="size-3.5 text-fg-dim" />
                  <span className={m.to ? 'font-semibold text-emerald' : 'text-crimson'}>{m.to ? formatDateKey(m.to, 'MMM d') : 'unscheduled'}</span>
                </div>
              ))}
              {preview.dropped.map((q) => (
                <div key={q.id} className="flex items-center gap-3 px-3 py-2 text-sm text-fg-muted"><Scissors className="size-3.5 text-cyan" /><span className="flex-1 truncate">{q.title}</span><Badge tone="cyan">skip</Badge></div>
              ))}
            </div>
          </div>
          {preview.milestoneMoves.length > 0 && (
            <p className="text-xs text-fg-muted">Milestone deadlines updated: {preview.milestoneMoves.map((m) => `${m.milestone.title} (${m.from ?? '—'} → ${m.to ?? '—'})`).join(' · ')}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
