import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, CalendarRange, CheckCircle2, Clock, Flag, GanttChart, Lock, MoreHorizontal, Pause, Pencil, Play, Plus, RefreshCcw, Star, Target, Trash2,
  Trophy, Unlock,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QuestList } from '@/components/quest/QuestList';
import { Button, LinkButton } from '@/components/ui/button';
import { Dialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Badge, EmptyState, Field, Input, Panel, ProgressBar, ProgressRing, Textarea, Tooltip } from '@/components/ui/primitives';
import { db } from '@/db/schema';
import type { Campaign } from '@/domain/types';
import { campaignProgress } from '@/features/dashboard/CommandCenter';
import { useQuests, useSettings, useToday } from '@/hooks/data';
import { diffDays, formatDateKey, relativeDayLabel, WEEKDAY_SHORT } from '@/lib/dates';
import { cn, formatMinutes, orEmpty } from '@/lib/utils';
import { TEMPLATE_BY_ID } from '@/planning/catalog';
import { findMissedQuests } from '@/planning/rescheduler';
import { addMilestone, addQuestline, deleteCampaign, deleteQuestline, setCampaignStatus, updateCampaign, updateMilestone, updateQuestline } from '@/services/campaigns';
import { updateSettings } from '@/services/core';
import { useUI } from '@/store/ui';
import { RescheduleDialog } from './RescheduleDialog';
import { SWATCHES, swatch, swatchAlpha } from '@/lib/colors';

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const settings = useSettings();
  const campaign = useLiveQuery(() => (id ? db.campaigns.get(id) : undefined), [id]);
  const lines = orEmpty(useLiveQuery(() => (id ? db.questlines.where('campaignId').equals(id).sortBy('order') : []), [id]));
  const milestones = orEmpty(useLiveQuery(() => (id ? db.milestones.where('campaignId').equals(id).sortBy('order') : []), [id]));
  const all = useQuests();
  const quests = useMemo(() => (all ?? []).filter((q) => q.campaignId === id && !q.archivedAt), [all, id]);
  const openEditor = useUI((s) => s.openEditor);
  const toast = useUI((s) => s.toast);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newLine, setNewLine] = useState('');

  if (campaign === undefined || !all) return null;
  if (!campaign) return <Panel><EmptyState icon={<Flag />} title="Campaign not found" action={<LinkButton to="/campaigns" variant="primary">All campaigns</LinkButton>} /></Panel>;

  const p = campaignProgress(campaign, quests);
  const total = diffDays(campaign.endDate, campaign.startDate) + 1;
  const elapsed = Math.min(total, Math.max(0, diffDays(today, campaign.startDate) + 1));
  const missed = findMissedQuests(quests, today);
  const hex = swatch(campaign.color);
  const isDefault = settings?.defaultCampaignId === campaign.id;
  const recurring = quests.filter((q) => q.origin === 'recurring' && q.scheduledDate === today);
  const loose = quests.filter((q) => !q.questlineId && q.origin !== 'recurring');

  return (
    <div>
      <button onClick={() => navigate('/campaigns')} className="mb-4 flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="size-4" /> Campaigns</button>
      <Panel runes className="relative mb-5 overflow-hidden p-6">
        <div className="absolute inset-0 opacity-50" style={{ background: `radial-gradient(80% 120% at 0% 0%, ${swatchAlpha(campaign.color, 16)}, transparent 60%)` }} />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <ProgressRing value={p.ratio} size={108} stroke={8} tone={hex}>
            <div className="text-center">
              <div className="font-num text-2xl font-bold" data-testid="campaign-progress">{Math.round(p.ratio * 100)}%</div>
              <div className="text-[0.6rem] tracking-wider text-fg-dim uppercase">complete</div>
            </div>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={campaign.status === 'active' ? 'emerald' : campaign.status === 'completed' ? 'gold' : 'neutral'} className="capitalize">{campaign.status}</Badge>
              {isDefault && <Badge tone="accent"><Star /> Default</Badge>}
              <span className="text-xs text-fg-muted">{formatDateKey(campaign.startDate, 'MMM d')} → {formatDateKey(campaign.endDate, 'MMM d, yyyy')} · {campaign.hoursPerDay}h/day · {campaign.workdays.map((d) => WEEKDAY_SHORT[d]).join(' ')}</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide md:text-3xl">{campaign.name}</h1>
            {campaign.objective && <p className="mt-2 max-w-3xl text-sm text-fg-muted">{campaign.objective}</p>}
            {campaign.outcomes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">{campaign.outcomes.map((o) => <Badge key={o} tone="gold"><Trophy /> {o}</Badge>)}</div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
            <Button variant={missed.length ? 'gold' : 'secondary'} onClick={() => setRescheduleOpen(true)} data-testid="open-reschedule">
              <RefreshCcw /> Rebalance{missed.length ? ` (${missed.length} missed)` : ''}
            </Button>
            <Button variant="primary" onClick={() => openEditor(undefined, { campaignId: campaign.id, questlineId: lines[0]?.id })}><Plus /> Add quest</Button>
            <div className="flex gap-2">
              <LinkButton to="/timeline" variant="ghost" className="flex-1"><GanttChart /> Timeline</LinkButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Campaign actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil /> Edit details</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void updateSettings({ defaultCampaignId: isDefault ? undefined : campaign.id })}><Star /> {isDefault ? 'Unset default' : 'Set as default'}</DropdownMenuItem>
                  {campaign.status === 'active' ? (
                    <DropdownMenuItem onSelect={() => void setCampaignStatus(campaign.id, 'paused')}><Pause /> Pause</DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => void setCampaignStatus(campaign.id, 'active')}><Play /> Resume</DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => void setCampaignStatus(campaign.id, 'completed')}><CheckCircle2 /> Mark completed</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void setCampaignStatus(campaign.id, 'archived').then(() => navigate('/campaigns'))}><Flag /> Archive</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => {
                    if (!confirm(`Delete “${campaign.name}”?`)) return;
                    const keep = confirm('Keep its quests as standalone quests?\n\nOK = keep quests · Cancel = delete quests too');
                    void deleteCampaign(campaign.id, keep).then(() => { toast({ title: 'Campaign deleted', description: 'Earned XP is kept.' }); navigate('/campaigns'); });
                  }}><Trash2 /> Delete…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric icon={<Target />} label="Quests" value={`${p.done}/${p.total}`} />
          <Metric icon={<Clock />} label="Work done" value={`${formatMinutes(p.doneHours)} / ${formatMinutes(p.hours)}`} />
          <Metric icon={<CalendarRange />} label="Timeline" value={`Day ${elapsed}/${total}`} bar={elapsed / total} />
          <Metric icon={<RefreshCcw />} label="Missed" value={String(missed.length)} tone={missed.length ? 'text-crimson' : undefined} />
        </div>
      </Panel>

      {recurring.length > 0 && (
        <Panel className="mb-4 p-3">
          <h3 className="px-2 pt-1 pb-2 text-xs font-bold tracking-wider text-fg-dim uppercase">Today’s recurring quests</h3>
          <QuestList quests={recurring} today={today} showCampaign={false} compact />
        </Panel>
      )}

      <div className="space-y-4">
        {lines.map((line) => {
          const lq = quests.filter((q) => q.questlineId === line.id);
          const lDone = lq.filter((q) => q.status === 'done').length;
          const tpl = line.templateId ? TEMPLATE_BY_ID.get(line.templateId) : undefined;
          const lMs = milestones.filter((m) => m.questlineId === line.id);
          return (
            <Panel key={line.id} className="overflow-hidden" data-testid="questline">
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
                <span className="grid size-9 place-items-center rounded-xl border border-line bg-surface-2 text-accent"><Icon name={tpl?.icon ?? 'scroll'} className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display font-semibold">{line.title}</h2>
                  <ProgressBar value={lq.length ? lDone / lq.length : 0} height={4} className="mt-1.5 max-w-xs" tone="emerald" label={`${line.title} progress`} />
                </div>
                <span className="font-num text-xs text-fg-muted">{lDone}/{lq.length}</span>
                <Button size="xs" variant="ghost" onClick={() => openEditor(undefined, { campaignId: campaign.id, questlineId: line.id, skillIds: line.skillIds })}><Plus /> Quest</Button>
                <Button size="xs" variant="ghost" onClick={() => { const t = prompt('Milestone title'); if (t?.trim()) void addMilestone(campaign.id, line.id, t); }}><Flag /> Milestone</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Questline actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => { const t = prompt('Rename questline', line.title); if (t?.trim()) void updateQuestline(line.id, { title: t.trim() }); }}><Pencil /> Rename</DropdownMenuItem>
                    <DropdownMenuItem danger onSelect={() => confirm(`Delete questline “${line.title}” and its ${lq.length} quests?`) && void deleteQuestline(line.id)}><Trash2 /> Delete questline</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="p-3">
                {lMs.map((m) => {
                  const mq = lq.filter((q) => q.milestoneId === m.id).sort((a, b) => (a.scheduledDate ?? '9').localeCompare(b.scheduledDate ?? '9') || a.order - b.order);
                  const mDone = mq.filter((q) => q.status === 'done').length;
                  return (
                    <section key={m.id} className="mb-2">
                      <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                        <span className={cn('size-2 rotate-45', mDone === mq.length && mq.length ? 'bg-emerald' : 'bg-fg-dim')} />
                        <h3 className="text-xs font-bold tracking-wider text-fg-muted uppercase">{m.title}</h3>
                        <span className="font-num text-[0.7rem] text-fg-dim">{mDone}/{mq.length}</span>
                        {m.dueDate && <span className={cn('text-[0.7rem]', m.dueDate < today && mDone < mq.length ? 'text-crimson' : 'text-fg-dim')}>· due {relativeDayLabel(m.dueDate, today)}</span>}
                        <Tooltip content={m.deadlineLocked ? 'Deadline locked — never moved by rescheduling' : 'Lock milestone deadline'}>
                          <button onClick={() => void updateMilestone(m.id, { deadlineLocked: !m.deadlineLocked })} className={m.deadlineLocked ? 'text-gold' : 'text-fg-dim hover:text-fg'} aria-label="Toggle milestone deadline lock">
                            {m.deadlineLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                          </button>
                        </Tooltip>
                      </div>
                      <QuestList quests={mq} today={today} showCampaign={false} empty={<p className="px-3 py-2 text-xs text-fg-dim">No quests in this milestone.</p>} />
                    </section>
                  );
                })}
                {(() => {
                  const noMs = lq.filter((q) => !q.milestoneId || !lMs.some((m) => m.id === q.milestoneId));
                  return noMs.length ? <QuestList quests={noMs} today={today} showCampaign={false} /> : null;
                })()}
                {lq.length === 0 && lMs.length === 0 && <p className="p-3 text-sm text-fg-dim">Empty questline — add a quest or milestone.</p>}
              </div>
            </Panel>
          );
        })}
        {loose.length > 0 && (
          <Panel className="p-3">
            <h3 className="px-2 pt-1 pb-2 text-xs font-bold tracking-wider text-fg-dim uppercase">Other quests</h3>
            <QuestList quests={loose} today={today} showCampaign={false} />
          </Panel>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newLine.trim()) void addQuestline(campaign.id, newLine).then(() => setNewLine('')); }}>
          <Input value={newLine} onChange={(e) => setNewLine(e.target.value)} placeholder="Add a questline (e.g. Portfolio polish)" aria-label="New questline" />
          <Button type="submit" variant="secondary"><Plus /> Questline</Button>
        </form>
      </div>

      <RescheduleDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen} campaign={campaign} quests={quests} milestones={milestones} />
      <EditCampaignDialog open={editOpen} onOpenChange={setEditOpen} campaign={campaign} />
    </div>
  );
}

function Metric({ icon, label, value, bar, tone }: { icon: ReactNode; label: string; value: string; bar?: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-3">
      <div className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wider text-fg-dim uppercase [&_svg]:size-3.5">{icon}{label}</div>
      <div className={cn('mt-1 font-num text-lg font-semibold', tone)}>{value}</div>
      {bar !== undefined && <ProgressBar value={bar} height={3} tone="cyan" className="mt-1.5" label={label} />}
    </div>
  );
}

function EditCampaignDialog({ open, onOpenChange, campaign }: { open: boolean; onOpenChange: (v: boolean) => void; campaign: Campaign }) {
  const [form, setForm] = useState(campaign);
  const toast = useUI((s) => s.toast);
  const save = async () => {
    if (form.endDate < form.startDate) return toast({ title: 'End date must be after start date', tone: 'error' });
    await updateCampaign(campaign.id, { name: form.name, objective: form.objective, startDate: form.startDate, endDate: form.endDate, hoursPerDay: form.hoursPerDay, workdays: form.workdays, color: form.color });
    toast({ title: 'Campaign updated', description: 'Use Rebalance to redistribute quests over the new window.', tone: 'success' });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setForm(campaign); onOpenChange(o); }} title="Edit campaign" footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" htmlFor="ec-name"><Input id="ec-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Objective" htmlFor="ec-obj"><Textarea id="ec-obj" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Start" htmlFor="ec-s"><Input id="ec-s" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field label="End" htmlFor="ec-e"><Input id="ec-e" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          <Field label="Hours/day" htmlFor="ec-h"><Input id="ec-h" type="number" min={0.25} max={16} step={0.25} value={form.hoursPerDay} onChange={(e) => setForm({ ...form, hoursPerDay: Number(e.target.value) || 1 })} /></Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_SHORT.map((d, i) => (
            <button key={d} aria-pressed={form.workdays.includes(i)} onClick={() => setForm({ ...form, workdays: form.workdays.includes(i) ? form.workdays.filter((x) => x !== i) : [...form.workdays, i].sort() })} className={cn('h-9 w-11 rounded-lg border text-xs font-semibold', form.workdays.includes(i) ? 'border-accent text-fg' : 'border-line text-fg-dim')}>{d}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {SWATCHES.map((c) => <button key={c} onClick={() => setForm({ ...form, color: c })} aria-label={c} aria-pressed={form.color === c} className={cn('size-8 rotate-45 rounded-md border-2', form.color === c ? 'border-fg' : 'border-transparent')} style={{ background: swatch(c) }} />)}
        </div>
      </div>
    </Dialog>
  );
}
