import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, GanttChart, GitBranch, Lock, RefreshCcw, Route, ZoomIn } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button, LinkButton } from '@/components/ui/button';
import { EmptyState, PageHeader, Panel, Segmented, Select, Switch, Tooltip } from '@/components/ui/primitives';
import { db } from '@/db/schema';
import { isOverdue } from '@/domain/briefing';
import type { Campaign, Quest } from '@/domain/types';
import { RescheduleDialog } from '@/features/campaigns/RescheduleDialog';
import { useCampaigns, useQuests, useToday } from '@/hooks/data';
import { addDaysKey, diffDays, eachDateKey, formatDateKey, weekdayOf } from '@/lib/dates';
import { cn, formatMinutes, orEmpty } from '@/lib/utils';
import { criticalPath } from '@/planning/critical';
import { findMissedQuests } from '@/planning/rescheduler';
import { updateQuest } from '@/services/quests';
import { useUI } from '@/store/ui';

type Zoom = 'day' | 'week' | 'month';
const PX: Record<Zoom, number> = { day: 44, week: 18, month: 7 };
const ROW = 34;
const LABEL_W = 260;

interface Row {
  kind: 'line' | 'quest';
  id: string;
  title: string;
  quest?: Quest;
  milestones?: { id: string; title: string; dueDate?: string; locked: boolean }[];
}

export default function TimelinePage() {
  const campaigns = useCampaigns();
  const allQuests = useQuests();
  const lines = orEmpty(useLiveQuery(() => db.questlines.toArray(), []));
  const milestones = orEmpty(useLiveQuery(() => db.milestones.toArray(), []));
  const today = useToday();
  const toast = useUI((s) => s.toast);
  const openEditor = useUI((s) => s.openEditor);
  const [campaignId, setCampaignId] = useState<string>('');
  const [zoom, setZoom] = useState<Zoom>('week');
  const [showDeps, setShowDeps] = useState(true);
  const [showCritical, setShowCritical] = useState(true);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const active = useMemo(() => (campaigns ?? []).filter((c) => c.status === 'active' || c.status === 'paused'), [campaigns]);
  useEffect(() => {
    if (!campaignId && active[0]) setCampaignId(active[0].id);
  }, [active, campaignId]);
  const campaign: Campaign | undefined = campaigns?.find((c) => c.id === campaignId);
  const quests = useMemo(() => (allQuests ?? []).filter((q) => q.campaignId === campaignId && q.origin !== 'recurring' && !q.archivedAt && q.scheduledDate), [allQuests, campaignId]);
  const cMilestones = milestones.filter((m) => m.campaignId === campaignId);

  const [start, end] = useMemo(() => {
    if (!campaign) return [today, addDaysKey(today, 30)];
    const dates = quests.map((q) => q.scheduledDate!);
    const s = [campaign.startDate, ...dates].sort()[0];
    const e = [campaign.endDate, ...dates].sort().pop()!;
    return [addDaysKey(s, -2), addDaysKey(e, 3)];
  }, [campaign, quests, today]);
  const days = useMemo(() => eachDateKey(start, end), [start, end]);
  const px = PX[zoom];

  const span = (q: Quest) => Math.max(1, Math.ceil(q.estimatedMinutes / 60 / Math.max(0.5, campaign?.hoursPerDay ?? 4)));
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const cLines = lines.filter((l) => l.campaignId === campaignId).sort((a, b) => a.order - b.order);
    for (const l of cLines) {
      const lq = quests.filter((q) => q.questlineId === l.id).sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!) || a.order - b.order);
      out.push({ kind: 'line', id: l.id, title: l.title, milestones: cMilestones.filter((m) => m.questlineId === l.id).map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, locked: m.deadlineLocked })) });
      for (const q of lq) out.push({ kind: 'quest', id: q.id, title: q.title, quest: q });
    }
    const loose = quests.filter((q) => !q.questlineId || !cLines.some((l) => l.id === q.questlineId));
    if (loose.length) {
      out.push({ kind: 'line', id: 'loose', title: 'Other quests', milestones: [] });
      for (const q of loose) out.push({ kind: 'quest', id: q.id, title: q.title, quest: q });
    }
    return out;
  }, [lines, quests, campaignId, cMilestones]);

  const critical = useMemo(() => {
    const pending = quests.filter((q) => q.status !== 'done' && q.status !== 'skipped');
    const ids = new Set(pending.map((q) => q.id));
    return new Set(criticalPath(pending.map((q) => ({ id: q.id, hours: q.estimatedMinutes / 60, deps: q.dependencies.filter((d) => ids.has(d)) }))));
  }, [quests]);

  const x = (date: string) => diffDays(date, start) * px;
  const missed = campaign ? findMissedQuests(quests, today) : [];

  // Horizontal drag-to-reschedule.
  const [drag, setDrag] = useState<{ id: string; originX: number; delta: number } | null>(null);
  const onPointerDown = (e: RPointerEvent, q: Quest) => {
    if (q.status === 'done') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: q.id, originX: e.clientX, delta: 0 });
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, delta: Math.round((e.clientX - drag.originX) / px) });
  };
  const onPointerUp = async (q: Quest) => {
    if (!drag) return;
    const delta = drag.delta;
    setDrag(null);
    if (delta === 0) {
      openEditor(q.id);
      return;
    }
    const next = addDaysKey(q.scheduledDate!, delta);
    if (q.deadlineLocked && q.dueDate && next > q.dueDate && !confirm(`“${q.title}” has a locked deadline (${q.dueDate}). Schedule it after the deadline anyway? The deadline itself will not move.`)) return;
    await updateQuest(q.id, { scheduledDate: next });
    const deps = q.dependencies.map((d) => allQuests?.find((x2) => x2.id === d)).filter((d) => d && d.status !== 'done' && d.scheduledDate && d.scheduledDate > next);
    toast({ title: `Moved to ${formatDateKey(next)}`, description: deps.length ? `Heads up: ${deps.length} prerequisite(s) are scheduled later.` : undefined, tone: deps.length ? 'gold' : 'success', action: { label: 'Undo', run: () => void updateQuest(q.id, { scheduledDate: q.scheduledDate }) } });
  };

  useEffect(() => {
    if (scroller.current && days.includes(today)) scroller.current.scrollLeft = Math.max(0, x(today) - 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, zoom]);

  if (!campaigns || !allQuests) return null;
  if (active.length === 0) {
    return (
      <div>
        <PageHeader eyebrow="Roadmap" title="Timeline" />
        <Panel><EmptyState icon={<GanttChart />} title="No active campaigns" description="Create a campaign to see its roadmap as an interactive Gantt chart." action={<LinkButton to="/campaigns/new" variant="primary">Create campaign</LinkButton>} /></Panel>
      </div>
    );
  }

  const width = days.length * px;
  const height = rows.length * ROW;
  const bars = new Map<string, { x: number; y: number; w: number }>();
  rows.forEach((r, i) => {
    if (r.quest) {
      const dx = drag?.id === r.id ? drag.delta * px : 0;
      bars.set(r.id, { x: x(r.quest.scheduledDate!) + dx, y: i * ROW, w: span(r.quest) * px });
    }
  });

  return (
    <div>
      <PageHeader
        eyebrow="Roadmap"
        title="Timeline"
        description="Drag bars to reschedule. Lines show dependencies; the gold chain is the critical path — the longest dependency chain of remaining work."
        actions={
          <>
            <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="h-9 w-56" aria-label="Campaign">
              {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Segmented ariaLabel="Zoom" value={zoom} onChange={setZoom} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
            {campaign && <Button variant={missed.length ? 'gold' : 'secondary'} onClick={() => setRescheduleOpen(true)}><RefreshCcw /> Rebalance{missed.length ? ` (${missed.length})` : ''}</Button>}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-5 text-xs text-fg-muted">
        <label className="flex items-center gap-2"><Switch checked={showDeps} onCheckedChange={setShowDeps} /> <GitBranch className="size-3.5" /> Dependencies</label>
        <label className="flex items-center gap-2"><Switch checked={showCritical} onCheckedChange={setShowCritical} /> <Route className="size-3.5 text-gold" /> Critical path</label>
        <span className="flex items-center gap-1.5"><ZoomIn className="size-3.5" /> {zoom} view</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-gold" /> milestone</span>
        <span className="flex items-center gap-1.5"><Lock className="size-3 text-gold" /> locked deadline</span>
      </div>
      <Panel className="overflow-hidden">
        <div className="flex">
          <div className="shrink-0 border-r border-line" style={{ width: LABEL_W }}>
            <div className="h-12 border-b border-line" />
            {rows.map((r) => (
              <div key={r.id} className={cn('flex items-center gap-2 truncate px-3 text-sm', r.kind === 'line' ? 'bg-surface-2/60 font-display font-semibold' : 'pl-6 text-fg-muted')} style={{ height: ROW }}>
                {r.quest?.status === 'done' && <CheckCircle2 className="size-3.5 shrink-0 text-emerald" />}
                <span className="truncate">{r.title}</span>
              </div>
            ))}
          </div>
          <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
            <div style={{ width }} className="relative">
              <div className="sticky top-0 flex h-12 border-b border-line bg-surface">
                {days.map((d) => {
                  const show = zoom === 'day' || (zoom === 'week' && weekdayOf(d) === 1) || (zoom === 'month' && d.endsWith('-01'));
                  return (
                    <div key={d} className={cn('relative shrink-0 border-l', show ? 'border-line' : 'border-transparent', d === today && 'bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]')} style={{ width: px }}>
                      {show && <span className="absolute top-1.5 left-1 font-num text-[0.62rem] whitespace-nowrap text-fg-dim">{formatDateKey(d, zoom === 'month' ? 'MMM yyyy' : zoom === 'week' ? 'MMM d' : 'EEE d')}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="relative" style={{ height }}>
                {days.map((d, i) => (weekdayOf(d) === 0 || weekdayOf(d) === 6) && zoom !== 'month' ? <div key={d} className="absolute inset-y-0 bg-surface-2/40" style={{ left: i * px, width: px }} /> : null)}
                {rows.map((r, i) => r.kind === 'line' && <div key={r.id} className="absolute inset-x-0 border-y border-line bg-surface-2/30" style={{ top: i * ROW, height: ROW }} />)}
                {days.includes(today) && <div className="absolute inset-y-0 z-10 w-px bg-crimson shadow-[0_0_8px_var(--c-crimson)]" style={{ left: x(today) + px / 2 }} />}
                {campaign && <div className="absolute inset-y-0 w-px border-l border-dashed border-gold/50" style={{ left: x(campaign.endDate) + px }} />}
                {showDeps && (
                  <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
                    {rows.flatMap((r) => (r.quest?.dependencies ?? []).map((d) => {
                      const from = bars.get(d);
                      const to = bars.get(r.id);
                      if (!from || !to) return null;
                      const x1 = from.x + from.w - 2;
                      const y1 = from.y + ROW / 2;
                      const x2 = to.x + 2;
                      const y2 = to.y + ROW / 2;
                      const crit = showCritical && critical.has(d) && critical.has(r.id);
                      const bad = to.x < from.x - 1; // dependent starts before its prerequisite
                      return <path key={`${d}-${r.id}`} d={`M${x1},${y1} C${x1 + 18},${y1} ${x2 - 18},${y2} ${x2},${y2}`} fill="none" stroke={bad ? 'var(--c-crimson)' : crit ? 'var(--c-gold)' : 'var(--line-strong)'} strokeWidth={crit ? 1.8 : 1.2} strokeDasharray={bad ? '4 3' : undefined} />;
                    }))}
                  </svg>
                )}
                {rows.map((r, i) => {
                  if (r.kind === 'line') {
                    return (r.milestones ?? []).filter((m) => m.dueDate).map((m) => (
                      <Tooltip key={m.id} content={`${m.title} · ${formatDateKey(m.dueDate!)}${m.locked ? ' · locked' : ''}`}>
                        <div className="absolute z-20 flex items-center" style={{ top: i * ROW + ROW / 2 - 7, left: x(m.dueDate!) + px / 2 - 7 }}>
                          <span className={cn('size-3.5 rotate-45 rounded-[2px] border', m.locked ? 'border-gold bg-gold' : 'border-gold bg-surface')} />
                          {m.locked && <Lock className="ml-1 size-3 text-gold" />}
                        </div>
                      </Tooltip>
                    ));
                  }
                  const q = r.quest!;
                  const b = bars.get(q.id)!;
                  const done = q.status === 'done';
                  const overdue = isOverdue(q, today);
                  const crit = showCritical && critical.has(q.id);
                  const late = q.dueDate && q.scheduledDate! > q.dueDate;
                  return (
                    <Tooltip key={q.id} content={`${q.title} · ${formatDateKey(q.scheduledDate!)} · ${formatMinutes(q.estimatedMinutes)}${q.dueDate ? ` · due ${q.dueDate}` : ''}${late ? ' · after deadline!' : ''}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`${q.title}, scheduled ${q.scheduledDate}`}
                        onKeyDown={(e) => e.key === 'Enter' && openEditor(q.id)}
                        onPointerDown={(e) => onPointerDown(e, q)}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => void onPointerUp(q)}
                        className={cn(
                          'absolute z-10 flex touch-none items-center overflow-hidden rounded-md border px-1.5 text-[0.68rem] font-semibold whitespace-nowrap select-none',
                          done ? 'cursor-default border-emerald/40 bg-[color-mix(in_oklab,var(--c-emerald)_22%,var(--surface))] text-emerald' : 'cursor-grab active:cursor-grabbing',
                          !done && (q.category === 'boss' ? 'border-crimson/60 bg-[color-mix(in_oklab,var(--c-crimson)_22%,var(--surface))]' : q.optional ? 'border-cyan/40 bg-[color-mix(in_oklab,var(--c-cyan)_14%,var(--surface))]' : 'border-[color-mix(in_oklab,var(--accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent)_22%,var(--surface))]'),
                          overdue && 'ring-1 ring-crimson',
                          crit && !done && 'shadow-[0_0_0_1px_var(--c-gold),0_0_12px_-2px_var(--c-gold)]',
                          late && 'outline outline-1 outline-offset-1 outline-dashed outline-crimson',
                          drag?.id === q.id && 'z-30 opacity-90 shadow-xl',
                        )}
                        style={{ top: b.y + 6, left: b.x + 1, width: Math.max(6, b.w - 2), height: ROW - 12 }}
                      >
                        {b.w > 40 && <span className="truncate">{q.title}</span>}
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Panel>
      {campaign && <RescheduleDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen} campaign={campaign} quests={(allQuests ?? []).filter((q) => q.campaignId === campaign.id)} milestones={cMilestones} />}
    </div>
  );
}
