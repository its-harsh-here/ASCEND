import type { DateSelectArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, PageHeader, Panel, Segmented, Select, Switch, Textarea } from '@/components/ui/primitives';
import { isOverdue } from '@/domain/briefing';
import type { TimeBlock } from '@/domain/types';
import { useCampaigns, useQuests, useSettings, useTimeBlocks, useToday } from '@/hooks/data';
import { minutesFromTime, toDateKey, weekdayOf } from '@/lib/dates';
import { cn, orEmpty } from '@/lib/utils';
import { deleteTimeBlock, saveTimeBlock } from '@/services/misc';
import { updateQuest } from '@/services/quests';
import { useUI } from '@/store/ui';
import './calendar.css';

type View = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function CalendarPage() {
  const quests = useQuests();
  const blocks = useTimeBlocks();
  const campaigns = orEmpty(useCampaigns());
  const settings = useSettings();
  const today = useToday();
  const openEditor = useUI((s) => s.openEditor);
  const toast = useUI((s) => s.toast);
  const cal = useRef<FullCalendar>(null);
  const [view, setView] = useState<View>(window.innerWidth < 768 ? 'listWeek' : 'dayGridMonth');
  const [title, setTitle] = useState('');
  const [campaign, setCampaign] = useState('all');
  const [showDeadlines, setShowDeadlines] = useState(true);
  const [showDone, setShowDone] = useState(true);
  const [showBlocks, setShowBlocks] = useState(true);
  const [blockDraft, setBlockDraft] = useState<Partial<TimeBlock> | null>(null);
  const [selection, setSelection] = useState<{ date: string; start?: string; end?: string } | null>(null);

  const visible = useMemo(() => (quests ?? []).filter((q) => !q.archivedAt && q.status !== 'skipped' && (campaign === 'all' || (campaign === 'none' ? !q.campaignId : q.campaignId === campaign)) && (showDone || q.status !== 'done')), [quests, campaign, showDone]);

  const workload = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of visible) if (q.scheduledDate && q.status !== 'done') m.set(q.scheduledDate, (m.get(q.scheduledDate) ?? 0) + q.estimatedMinutes);
    for (const b of blocks ?? []) if (b.kind === 'commitment') m.set(b.date, (m.get(b.date) ?? 0) + minutesFromTime(b.end) - minutesFromTime(b.start));
    return m;
  }, [visible, blocks]);

  const events: EventInput[] = useMemo(() => {
    const out: EventInput[] = [];
    for (const q of visible) {
      if (q.scheduledDate) {
        const cls = cn(q.origin === 'recurring' ? 'ev-recurring' : q.category === 'boss' || q.category === 'legendary' ? 'ev-boss' : 'ev-quest', q.status === 'done' && 'ev-done', isOverdue(q, today) && 'ev-overdue');
        if (q.scheduledTime) {
          const start = `${q.scheduledDate}T${q.scheduledTime}:00`;
          const end = new Date(new Date(start).getTime() + Math.max(15, q.estimatedMinutes) * 60000);
          out.push({ id: `q:${q.id}`, title: q.title, start, end, classNames: cls.split(' '), editable: q.status !== 'done' });
        } else {
          out.push({ id: `q:${q.id}`, title: q.title, start: q.scheduledDate, allDay: true, classNames: cls.split(' '), editable: q.status !== 'done', durationEditable: false });
        }
      }
      if (showDeadlines && q.dueDate && q.status !== 'done' && q.dueDate !== q.scheduledDate && (q.deadlineLocked || q.origin !== 'generated' || q.category === 'boss')) {
        out.push({ id: `d:${q.id}`, title: `⚑ ${q.title}`, start: q.dueDate, allDay: true, classNames: ['ev-deadline'], editable: false });
      }
    }
    if (showBlocks) for (const b of blocks ?? []) out.push({ id: `b:${b.id}`, title: b.title, start: `${b.date}T${b.start}:00`, end: `${b.date}T${b.end}:00`, classNames: ['ev-block'], editable: true });
    return out;
  }, [visible, blocks, showDeadlines, showBlocks, today]);

  const onDrop = async (arg: EventDropArg) => {
    const [kind, id] = arg.event.id.split(/:(.+)/);
    const start = arg.event.start!;
    if (kind === 'q') {
      const q = quests?.find((x) => x.id === id);
      const date = toDateKey(start);
      if (q?.deadlineLocked && q.dueDate && date > q.dueDate && !confirm(`“${q.title}” has a locked deadline (${q.dueDate}). Schedule after it anyway? The deadline will not move.`)) return arg.revert();
      await updateQuest(id, { scheduledDate: date, scheduledTime: arg.event.allDay ? undefined : hhmm(start) });
      toast({ title: 'Quest rescheduled', description: date, tone: 'success', action: { label: 'Undo', run: () => void updateQuest(id, { scheduledDate: q?.scheduledDate, scheduledTime: q?.scheduledTime }) } });
    } else if (kind === 'b') {
      const end = arg.event.end ?? new Date(start.getTime() + 3600000);
      const b = blocks?.find((x) => x.id === id);
      if (b) await saveTimeBlock({ ...b, date: toDateKey(start), start: hhmm(start), end: hhmm(end) });
    }
  };

  const onResize = async (arg: EventResizeDoneArg) => {
    const [kind, id] = arg.event.id.split(/:(.+)/);
    const start = arg.event.start!;
    const end = arg.event.end!;
    if (kind === 'q') await updateQuest(id, { estimatedMinutes: Math.round((end.getTime() - start.getTime()) / 60000) });
    else if (kind === 'b') {
      const b = blocks?.find((x) => x.id === id);
      if (b) await saveTimeBlock({ ...b, start: hhmm(start), end: hhmm(end) });
    }
  };

  const onClick = (arg: EventClickArg) => {
    const [kind, id] = arg.event.id.split(/:(.+)/);
    if (kind === 'q' || kind === 'd') openEditor(id);
    else setBlockDraft(blocks?.find((b) => b.id === id) ?? null);
  };

  const onSelect = (arg: DateSelectArg) => {
    setSelection({ date: toDateKey(arg.start), start: arg.allDay ? undefined : hhmm(arg.start), end: arg.allDay ? undefined : hhmm(arg.end) });
  };

  const api = () => cal.current?.getApi();
  const capacity = Math.max(settings?.dailyHours ?? 4, ...campaigns.filter((c) => c.status === 'active').map((c) => c.hoursPerDay)) * 60;

  return (
    <div>
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description="Drag quests between days, resize timed quests to change their duration, and add time blocks for fixed commitments."
        actions={
          <>
            <Select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="h-9 w-48" aria-label="Filter by campaign">
              <option value="all">All campaigns</option>
              <option value="none">No campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => setBlockDraft({ date: today, start: '09:00', end: '10:00', kind: 'commitment', title: '' })}><Clock /> Time block</Button>
            <Button variant="primary" onClick={() => openEditor(undefined, { scheduledDate: today })}><Plus /> Quest</Button>
          </>
        }
      />
      <Panel className="ascend-cal p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => api()?.prev()} aria-label="Previous"><ChevronLeft /></Button>
            <Button size="xs" variant="secondary" onClick={() => api()?.today()}>Today</Button>
            <Button size="icon-sm" variant="ghost" onClick={() => api()?.next()} aria-label="Next"><ChevronRight /></Button>
          </div>
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-fg-muted"><Switch checked={showDeadlines} onCheckedChange={setShowDeadlines} /> Deadlines</label>
            <label className="flex items-center gap-2 text-xs text-fg-muted"><Switch checked={showBlocks} onCheckedChange={setShowBlocks} /> Blocks</label>
            <label className="flex items-center gap-2 text-xs text-fg-muted"><Switch checked={showDone} onCheckedChange={setShowDone} /> Completed</label>
            <Segmented ariaLabel="Calendar view" size="sm" value={view} onChange={(v) => { setView(v); api()?.changeView(v); }} options={[{ value: 'dayGridMonth', label: 'Month' }, { value: 'timeGridWeek', label: 'Week' }, { value: 'timeGridDay', label: 'Day' }, { value: 'listWeek', label: 'Agenda' }]} />
          </div>
        </div>
        <FullCalendar
          ref={cal}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={view}
          // "+N more" is an <a> without href that opens a popover: expose it as the button it is (axe aria-allowed-attr).
          moreLinkDidMount={({ el }) => el.setAttribute('role', 'button')}
          headerToolbar={false}
          height="auto"
          firstDay={1}
          events={events}
          editable
          selectable
          selectMirror
          nowIndicator
          dayMaxEvents={4}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          scrollTime={settings?.dayStart ?? '08:00'}
          eventDrop={(a) => void onDrop(a)}
          eventResize={(a) => void onResize(a)}
          eventClick={onClick}
          select={onSelect}
          datesSet={(a) => setTitle(a.view.title)}
          dayCellContent={(arg) => {
            const key = toDateKey(arg.date);
            const mins = workload.get(key) ?? 0;
            const isWork = settings?.workdays.includes(weekdayOf(key));
            return (
              <div className="flex w-full items-center justify-between gap-1">
                {mins > 0 && arg.view.type === 'dayGridMonth' ? (
                  <span className={cn('rounded px-1 font-num text-[0.62rem] font-semibold', mins > capacity ? 'bg-[color-mix(in_oklab,var(--c-crimson)_18%,transparent)] text-crimson' : 'text-fg-dim')} title={`${Math.round(mins / 6) / 10}h planned${isWork ? '' : ' (rest day)'}`}>
                    {Math.round(mins / 6) / 10}h
                  </span>
                ) : <span />}
                <span>{arg.dayNumberText}</span>
              </div>
            );
          }}
        />
      </Panel>

      <Dialog open={!!selection} onOpenChange={(o) => !o && setSelection(null)} title="Add to calendar" size="sm" description={selection ? `${selection.date}${selection.start ? ` · ${selection.start}–${selection.end}` : ''}` : undefined}>
        {selection && (
          <div className="grid gap-2">
            <Button variant="primary" onClick={() => { openEditor(undefined, { scheduledDate: selection.date, scheduledTime: selection.start, estimatedMinutes: selection.start && selection.end ? minutesFromTime(selection.end) - minutesFromTime(selection.start) : 60 }); setSelection(null); }}><Plus /> New quest</Button>
            <Button variant="secondary" onClick={() => { setBlockDraft({ date: selection.date, start: selection.start ?? '09:00', end: selection.end ?? '10:00', kind: 'commitment', title: '' }); setSelection(null); }}><Clock /> New time block</Button>
          </div>
        )}
      </Dialog>
      <TimeBlockDialog draft={blockDraft} onClose={() => setBlockDraft(null)} />
    </div>
  );
}

function TimeBlockDialog({ draft, onClose }: { draft: Partial<TimeBlock> | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<TimeBlock>>({});
  const toast = useUI((s) => s.toast);
  const open = !!draft;
  const [lastDraft, setLastDraft] = useState<Partial<TimeBlock> | null>(null);
  if (draft !== lastDraft) {
    setLastDraft(draft);
    if (draft) setForm(draft);
  }
  const save = async () => {
    try {
      await saveTimeBlock({ title: form.title?.trim() || 'Busy', date: form.date!, start: form.start!, end: form.end!, kind: form.kind ?? 'commitment', notes: form.notes ?? '', id: form.id });
      toast({ title: 'Time block saved', description: 'Commitments reduce available time when planning and rebalancing.', tone: 'success' });
      onClose();
    } catch (e) {
      toast({ title: 'Invalid time block', description: e instanceof Error ? e.message : String(e), tone: 'error' });
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={form.id ? 'Edit time block' : 'New time block'} size="sm"
      footer={<>
        {form.id && <Button variant="ghost" className="mr-auto text-crimson" onClick={() => void deleteTimeBlock(form.id!).then(onClose)}><Trash2 /> Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()}>Save</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Title" htmlFor="tb-t"><Input id="tb-t" autoFocus value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Class, work shift, gym…" /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date" htmlFor="tb-d"><Input id="tb-d" type="date" value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Start" htmlFor="tb-s"><Input id="tb-s" type="time" value={form.start ?? ''} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
          <Field label="End" htmlFor="tb-e"><Input id="tb-e" type="time" value={form.end ?? ''} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
        </div>
        <Field label="Type" htmlFor="tb-k">
          <Select id="tb-k" value={form.kind ?? 'commitment'} onChange={(e) => setForm({ ...form, kind: e.target.value as TimeBlock['kind'] })}>
            <option value="commitment">Commitment (reduces available time)</option>
            <option value="focus">Focus block (reserved for quests)</option>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="tb-n"><Textarea id="tb-n" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="min-h-16" /></Field>
      </div>
    </Dialog>
  );
}
