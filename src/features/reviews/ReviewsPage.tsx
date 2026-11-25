import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarArrowUp, ChevronLeft, ChevronRight, Lightbulb, NotebookPen, Save, Sparkles, Target, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getProvider, summarizeReview } from '@/ai/providers';
import { StatTile } from '@/components/game/widgets';
import { QuestList } from '@/components/quest/QuestList';
import { Button } from '@/components/ui/button';
import { Badge, Checkbox, Field, PageHeader, Panel, PanelHeader, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { db } from '@/db/schema';
import { ACHIEVEMENTS } from '@/domain/achievements';
import { isPending, questsForDay } from '@/domain/briefing';
import { localDate } from '@/domain/analytics';
import type { Review } from '@/domain/types';
import { useAchievementUnlocks, useCampaigns, useFocusSessions, useQuests, useSettings, useToday, useXpEvents } from '@/hooks/data';
import { useCelebrateAchievements } from '@/hooks/useQuestActions';
import { addDaysKey, formatDateKey, isoWeekKey, weekStartKey } from '@/lib/dates';
import { cn, formatMinutes, formatNumber, orEmpty } from '@/lib/utils';
import { reviewId, saveReview } from '@/services/misc';
import { bulkUpdateQuests } from '@/services/quests';
import { useUI } from '@/store/ui';

export default function ReviewsPage() {
  return (
    <div>
      <PageHeader eyebrow="Reflection" title="Reviews" description="Short, honest reviews built from your real activity. Reflection turns effort into learning." />
      <Tabs defaultValue="daily">
        <TabsList className="mb-5">
          <TabsTrigger value="daily"><NotebookPen /> Daily review</TabsTrigger>
          <TabsTrigger value="weekly"><CalendarArrowUp /> Weekly review</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailyReview /></TabsContent>
        <TabsContent value="weekly"><WeeklyReview /></TabsContent>
      </Tabs>
    </div>
  );
}

function useReviewDraft(kind: Review['kind'], periodKey: string) {
  const stored = useLiveQuery(() => db.reviews.get(reviewId(kind, periodKey)), [kind, periodKey]);
  const [draft, setDraft] = useState<Partial<Review>>({});
  useEffect(() => {
    setDraft(stored ?? { notes: '', wins: '', blockers: '', priorities: [] });
  }, [stored, periodKey]);
  return { stored, draft, setDraft };
}

function AiSummary({ facts }: { facts: string }) {
  const settings = useSettings();
  const toast = useUI((s) => s.toast);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!settings || settings.ai.provider === 'none') return null;
  const run = async () => {
    const p = getProvider(settings.ai);
    if (!p) return;
    setBusy(true);
    try {
      const st = await p.check();
      if (!st.available) throw new Error(st.reason);
      setText(await summarizeReview(p, facts));
    } catch (e) {
      toast({ title: 'Local AI unavailable', description: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3">
      <Button size="xs" variant="ghost" className="text-gold" onClick={() => void run()} disabled={busy}><Sparkles /> {busy ? 'Writing…' : 'Narrative summary with local AI'}</Button>
      {text && <p className="mt-2 rounded-xl border border-gold/30 p-3 text-sm text-fg-muted"><Badge tone="gold" className="mb-1.5">AI-generated from your facts</Badge><br />{text}</p>}
    </div>
  );
}

function DailyReview() {
  const today = useToday();
  const [day, setDay] = useState(today);
  const quests = orEmpty(useQuests());
  const events = orEmpty(useXpEvents());
  const sessions = orEmpty(useFocusSessions());
  const toast = useUI((s) => s.toast);
  const celebrateAchievements = useCelebrateAchievements();
  const { stored, draft, setDraft } = useReviewDraft('daily', day);
  const tomorrow = addDaysKey(day, 1);

  const completed = quests.filter((q) => q.status === 'done' && q.completedAt && localDate(q.completedAt) === day);
  const unfinished = questsForDay(quests, day, today).filter(isPending);
  const xp = events.filter((e) => !e.revoked && e.date === day).reduce((a, e) => a + e.amount, 0);
  const focus = sessions.filter((s) => s.mode === 'focus' && s.date === day).reduce((a, s) => a + s.actualMinutes, 0);
  const candidates = quests.filter((q) => isPending(q) && q.origin !== 'recurring').sort((a, b) => (a.scheduledDate ?? '9').localeCompare(b.scheduledDate ?? '9')).slice(0, 25);
  const summary = `${formatDateKey(day, 'EEEE')}: ${completed.length} quest${completed.length === 1 ? '' : 's'} completed, ${formatNumber(xp)} XP, ${formatMinutes(focus)} of focus. ${unfinished.length ? `${unfinished.length} unfinished.` : 'Nothing left unfinished.'}`;

  const save = async () => {
    const priorities = draft.priorities ?? [];
    celebrateAchievements(await saveReview('daily', day, draft));
    if (priorities.length) await bulkUpdateQuests(priorities, { scheduledDate: tomorrow });
    toast({ title: 'Daily review saved', description: priorities.length ? `${priorities.length} priorities scheduled for ${formatDateKey(tomorrow, 'EEE')}.` : undefined, tone: 'success' });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="ghost" onClick={() => setDay(addDaysKey(day, -1))} aria-label="Previous day"><ChevronLeft /></Button>
          <span className="font-display text-lg font-semibold">{formatDateKey(day, 'EEEE, MMMM d')}</span>
          <Button size="icon-sm" variant="ghost" onClick={() => setDay(addDaysKey(day, 1))} disabled={day >= today} aria-label="Next day"><ChevronRight /></Button>
          {stored && <Badge tone="emerald">Saved</Badge>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Completed" value={completed.length} tone="emerald" />
          <StatTile label="XP earned" value={formatNumber(xp)} tone="gold" />
          <StatTile label="Focus" value={formatMinutes(focus)} tone="cyan" />
        </div>
        <Panel className="p-4">
          <p className="text-sm text-fg-muted" data-testid="daily-summary">{summary}</p>
          <AiSummary facts={summary} />
        </Panel>
        <Panel className="p-3">
          <PanelHeader className="px-2" title="Completed quests" eyebrow={`${completed.length}`} />
          <QuestList quests={completed} today={today} compact empty={<p className="px-3 pb-3 text-sm text-fg-dim">Nothing completed this day.</p>} />
        </Panel>
        <Panel className="p-3">
          <PanelHeader className="px-2" title="Unfinished" eyebrow={`${unfinished.length}`} actions={unfinished.length > 0 && <Button size="xs" variant="ghost" onClick={() => void bulkUpdateQuests(unfinished.filter((q) => q.origin !== 'recurring').map((q) => q.id), { scheduledDate: tomorrow })}><CalendarArrowUp /> Move to tomorrow</Button>} />
          <QuestList quests={unfinished} today={today} compact empty={<p className="px-3 pb-3 text-sm text-fg-dim">Clean slate.</p>} />
        </Panel>
      </div>
      <Panel className="p-5">
        <div className="space-y-4">
          <Field label="Wins — what went well?" htmlFor="dr-w"><Textarea id="dr-w" value={draft.wins ?? ''} onChange={(e) => setDraft({ ...draft, wins: e.target.value })} className="min-h-20" /></Field>
          <Field label="Blockers — what got in the way?" htmlFor="dr-b"><Textarea id="dr-b" value={draft.blockers ?? ''} onChange={(e) => setDraft({ ...draft, blockers: e.target.value })} className="min-h-20" /></Field>
          <Field label="Reflection notes" htmlFor="dr-n"><Textarea id="dr-n" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="min-h-24" /></Field>
          <div>
            <div className="mb-1.5 text-[0.78rem] font-semibold text-fg-muted">Energy</div>
            <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setDraft({ ...draft, energy: n })} aria-pressed={draft.energy === n} className={cn('h-9 flex-1 rounded-lg border text-sm font-semibold', draft.energy === n ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_15%,transparent)]' : 'border-line text-fg-dim')}>{n}</button>)}</div>
          </div>
          <div>
            <div className="mb-1.5 text-[0.78rem] font-semibold text-fg-muted">Tomorrow’s priorities (up to 3 — they’ll be scheduled for {formatDateKey(tomorrow, 'EEE, MMM d')})</div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
              {candidates.map((q) => {
                const on = draft.priorities?.includes(q.id) ?? false;
                return (
                  <label key={q.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <Checkbox checked={on} disabled={!on && (draft.priorities?.length ?? 0) >= 3} onCheckedChange={(v) => setDraft({ ...draft, priorities: v ? [...(draft.priorities ?? []), q.id] : (draft.priorities ?? []).filter((x) => x !== q.id) })} />
                    <span className="truncate">{q.title}</span>
                    {q.scheduledDate && <span className="ml-auto shrink-0 text-[0.68rem] text-fg-dim">{q.scheduledDate}</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <Button variant="primary" className="w-full" onClick={() => void save()} data-testid="save-daily-review"><Save /> Save review</Button>
        </div>
      </Panel>
    </div>
  );
}

function WeeklyReview() {
  const today = useToday();
  const [weekStart, setWeekStart] = useState(weekStartKey(today));
  const quests = orEmpty(useQuests());
  const events = orEmpty(useXpEvents());
  const sessions = orEmpty(useFocusSessions());
  const campaigns = orEmpty(useCampaigns());
  const unlocks = orEmpty(useAchievementUnlocks());
  const milestones = orEmpty(useLiveQuery(() => db.milestones.toArray(), []));
  const toast = useUI((s) => s.toast);
  const weekEnd = addDaysKey(weekStart, 6);
  const key = isoWeekKey(weekStart);
  const { stored, draft, setDraft } = useReviewDraft('weekly', key);

  const stats = useMemo(() => {
    const inRange = (d: string, s: string, e: string) => d >= s && d <= e;
    const prevS = addDaysKey(weekStart, -7);
    const prevE = addDaysKey(weekStart, -1);
    const sumXp = (s: string, e: string) => events.filter((x) => !x.revoked && inRange(x.date, s, e)).reduce((a, x) => a + x.amount, 0);
    const done = quests.filter((q) => q.status === 'done' && q.completedAt && inRange(localDate(q.completedAt), weekStart, weekEnd));
    const prevDone = quests.filter((q) => q.status === 'done' && q.completedAt && inRange(localDate(q.completedAt), prevS, prevE)).length;
    const scheduled = quests.filter((q) => q.scheduledDate && inRange(q.scheduledDate, weekStart, weekEnd) && !q.archivedAt);
    const missed = scheduled.filter((q) => q.status !== 'done' && (q.scheduledDate! < today || q.status === 'skipped'));
    const focus = sessions.filter((s) => s.mode === 'focus' && inRange(s.date, weekStart, weekEnd)).reduce((a, s) => a + s.actualMinutes, 0);
    const tracked = done.filter((q) => q.actualMinutes > 0);
    const estRatio = tracked.length >= 3 ? tracked.reduce((a, q) => a + q.actualMinutes, 0) / tracked.reduce((a, q) => a + q.estimatedMinutes, 0) : null;
    const rate = scheduled.length ? scheduled.filter((q) => q.status === 'done').length / scheduled.length : null;
    const perCampaign = campaigns.filter((c) => c.status !== 'archived').map((c) => ({ c, done: done.filter((q) => q.campaignId === c.id).length, total: quests.filter((q) => q.campaignId === c.id && !q.optional && q.origin !== 'recurring').length, allDone: quests.filter((q) => q.campaignId === c.id && q.status === 'done' && !q.optional && q.origin !== 'recurring').length })).filter((x) => x.done > 0 || x.c.status === 'active');
    const ach = unlocks.filter((u) => inRange(u.unlockedAt.slice(0, 10), weekStart, weekEnd)).map((u) => ACHIEVEMENTS.find((a) => a.id === u.id)).filter(Boolean);
    const upcoming = milestones.filter((m) => m.dueDate && m.dueDate > today && m.dueDate <= addDaysKey(today, 14)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    const suggestions: string[] = [];
    if (rate !== null && rate < 0.6) suggestions.push(`Only ${Math.round(rate * 100)}% of scheduled quests were completed — plan less per day or use Rebalance on your campaign.`);
    if (estRatio !== null && estRatio > 1.2) suggestions.push(`Quests took ${Math.round((estRatio - 1) * 100)}% longer than estimated — increase estimates for similar work.`);
    if (focus < 120 && done.length > 0) suggestions.push('Little tracked focus time — try linking quests to Focus Chamber sessions for better time data.');
    if (missed.length >= 3) suggestions.push(`${missed.length} scheduled quests were missed — review whether priorities or available hours need adjusting.`);
    if (sumXp(weekStart, weekEnd) > sumXp(prevS, prevE) && sumXp(prevS, prevE) > 0) suggestions.push('XP is up versus last week — keep the rhythm that worked.');
    if (suggestions.length === 0) suggestions.push(done.length ? 'Solid week. Keep your current cadence and protect rest days.' : 'Start small next week: schedule one or two quests per day.');
    return { done, prevDone, xp: sumXp(weekStart, weekEnd), prevXp: sumXp(prevS, prevE), focus, missed, rate, perCampaign, ach, upcoming, suggestions };
  }, [quests, events, sessions, campaigns, unlocks, milestones, weekStart, weekEnd, today]);

  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? 'new' : '—') : `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%`);
  const facts = `Week ${key}: ${stats.done.length} quests completed (prev ${stats.prevDone}), ${stats.xp} XP (prev ${stats.prevXp}), ${Math.round(stats.focus)} focus minutes, ${stats.missed.length} missed, ${stats.ach.length} achievements.`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="ghost" onClick={() => setWeekStart(addDaysKey(weekStart, -7))} aria-label="Previous week"><ChevronLeft /></Button>
        <span className="font-display text-lg font-semibold">{formatDateKey(weekStart, 'MMM d')} – {formatDateKey(weekEnd, 'MMM d, yyyy')}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setWeekStart(addDaysKey(weekStart, 7))} disabled={weekEnd >= today} aria-label="Next week"><ChevronRight /></Button>
        {stored && <Badge tone="emerald">Saved</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Quests completed" value={stats.done.length} sub={`${delta(stats.done.length, stats.prevDone)} vs last week`} tone="emerald" />
        <StatTile label="XP" value={formatNumber(stats.xp)} sub={`${delta(stats.xp, stats.prevXp)} vs last week`} tone="gold" />
        <StatTile label="Focus" value={formatMinutes(stats.focus)} tone="cyan" />
        <StatTile label="Completion" value={stats.rate === null ? '—' : `${Math.round(stats.rate * 100)}%`} sub={`${stats.missed.length} missed`} tone={stats.missed.length ? 'crimson' : 'accent'} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <div className="eyebrow mb-3 flex items-center gap-2"><Trophy className="size-3.5 text-gold" /> Weekly achievements</div>
          {stats.ach.length === 0 ? <p className="text-sm text-fg-dim">No achievements unlocked this week.</p> : <div className="flex flex-wrap gap-1.5">{stats.ach.map((a) => <Badge key={a!.id} tone="gold">{a!.title}</Badge>)}</div>}
          <div className="eyebrow mt-5 mb-3 flex items-center gap-2"><Target className="size-3.5 text-accent" /> Campaign progress</div>
          {stats.perCampaign.length === 0 && <p className="text-sm text-fg-dim">No campaign activity.</p>}
          {stats.perCampaign.map(({ c, done, total, allDone }) => (
            <div key={c.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
              <span className="truncate">{c.name}</span>
              <span className="font-num text-xs text-fg-muted">+{done} this week · {allDone}/{total} overall</span>
            </div>
          ))}
          <div className="eyebrow mt-5 mb-3">Upcoming milestones (14 days)</div>
          {stats.upcoming.length === 0 ? <p className="text-sm text-fg-dim">None.</p> : stats.upcoming.slice(0, 6).map((m) => <div key={m.id} className="flex justify-between py-1 text-sm"><span className="truncate">{m.title}</span><span className="text-xs text-fg-muted">{formatDateKey(m.dueDate!, 'EEE MMM d')}</span></div>)}
        </Panel>
        <Panel className="p-5">
          <div className="eyebrow mb-3 flex items-center gap-2"><Lightbulb className="size-3.5 text-gold" /> Suggested improvements</div>
          <ul className="space-y-2">{stats.suggestions.map((s) => <li key={s} className="flex gap-2 text-sm text-fg-muted"><span className="mt-2 size-1.5 shrink-0 rotate-45 bg-gold" />{s}</li>)}</ul>
          <AiSummary facts={facts} />
          {stats.missed.length > 0 && (
            <>
              <div className="eyebrow mt-5 mb-2">Missed objectives</div>
              <QuestList quests={stats.missed.slice(0, 8)} today={today} compact />
            </>
          )}
        </Panel>
      </div>
      <Panel className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Biggest wins" htmlFor="wr-w"><Textarea id="wr-w" value={draft.wins ?? ''} onChange={(e) => setDraft({ ...draft, wins: e.target.value })} /></Field>
          <Field label="What to change" htmlFor="wr-b"><Textarea id="wr-b" value={draft.blockers ?? ''} onChange={(e) => setDraft({ ...draft, blockers: e.target.value })} /></Field>
          <Field label="Notes for next week" htmlFor="wr-n"><Textarea id="wr-n" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
        </div>
        <Button variant="primary" className="mt-4" onClick={() => void saveReview('weekly', key, draft).then(() => toast({ title: 'Weekly review saved', tone: 'success' }))}><Save /> Save weekly review</Button>
      </Panel>
    </div>
  );
}
