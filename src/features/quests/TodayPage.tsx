import { AlarmClock, CalendarDays, CalendarPlus, Inbox, Plus, Repeat, Sun, Sunrise, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QuestList } from '@/components/quest/QuestList';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, PageHeader, Panel, PanelHeader, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { isOverdue, isPending, questScore, questsForDay } from '@/domain/briefing';
import { describeRecurrence } from '@/domain/recurrence';
import { PRIORITY_WEIGHT, type Quest } from '@/domain/types';
import { useCampaigns, useQuests, useRecurrences, useToday } from '@/hooks/data';
import { addDaysKey, formatDateKey } from '@/lib/dates';
import { formatMinutes, orEmpty } from '@/lib/utils';
import { bulkUpdateQuests } from '@/services/quests';
import { deleteRecurrence, updateRecurrence } from '@/services/recurring';
import { useUI } from '@/store/ui';

type SortKey = 'smart' | 'priority' | 'time' | 'xp';

function sortQuests(list: Quest[], key: SortKey, today: string): Quest[] {
  const done = (q: Quest) => Number(q.status === 'done');
  const by = {
    smart: (a: Quest, b: Quest) => questScore(b, today, 600) - questScore(a, today, 600),
    priority: (a: Quest, b: Quest) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
    time: (a: Quest, b: Quest) => (a.scheduledTime ?? '99').localeCompare(b.scheduledTime ?? '99') || a.estimatedMinutes - b.estimatedMinutes,
    xp: (a: Quest, b: Quest) => (b.xpReward ?? 0) - (a.xpReward ?? 0) || b.difficulty.localeCompare(a.difficulty),
  }[key];
  return [...list].sort((a, b) => done(a) - done(b) || by(a, b));
}

export default function TodayPage() {
  const quests = useQuests();
  const campaigns = orEmpty(useCampaigns());
  const recurrences = orEmpty(useRecurrences());
  const today = useToday();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const openEditor = useUI((s) => s.openEditor);
  const [campaign, setCampaign] = useState('all');
  const [sort, setSort] = useState<SortKey>('smart');
  const [tab, setTab] = useState('today');

  const filtered = useMemo(() => (quests ?? []).filter((q) => campaign === 'all' || (campaign === 'none' ? !q.campaignId : q.campaignId === campaign)), [quests, campaign]);
  const tomorrow = addDaysKey(today, 1);
  const lists = useMemo(() => {
    const todayList = sortQuests(questsForDay(filtered, today, today), sort, today);
    return {
      today: todayList,
      overdue: sortQuests(filtered.filter((q) => isOverdue(q, today)), sort, today),
      tomorrow: sortQuests(filtered.filter((q) => isPending(q) && q.scheduledDate === tomorrow), sort, today),
      upcoming: filtered.filter((q) => isPending(q) && q.scheduledDate && q.scheduledDate > tomorrow && q.scheduledDate <= addDaysKey(today, 7)).sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!)),
      inbox: sortQuests(filtered.filter((q) => isPending(q) && !q.scheduledDate && !q.dueDate), sort, today),
    };
  }, [filtered, today, tomorrow, sort]);

  if (!quests) return null;
  const doneToday = lists.today.filter((q) => q.status === 'done').length;
  const minutesLeft = lists.today.filter(isPending).reduce((s, q) => s + Math.max(0, q.estimatedMinutes - q.actualMinutes), 0);
  const upcomingByDay = lists.upcoming.reduce<Record<string, Quest[]>>((acc, q) => ((acc[q.scheduledDate!] ??= []).push(q), acc), {});

  return (
    <div>
      <PageHeader
        eyebrow={formatDateKey(today, 'EEEE, MMMM d')}
        title="Today’s Quests"
        description={`${doneToday} of ${lists.today.length} complete · ${formatMinutes(minutesLeft)} remaining`}
        actions={
          <>
            <Select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="h-9 w-48" aria-label="Filter by campaign">
              <option value="all">All campaigns</option>
              <option value="none">No campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-9 w-40" aria-label="Sort">
              <option value="smart">Smart order</option>
              <option value="priority">Priority</option>
              <option value="time">Time</option>
              <option value="xp">Reward</option>
            </Select>
            <Button variant="secondary" onClick={() => openEditor(undefined, { scheduledDate: today })}><Plus /> Detailed</Button>
            <Button variant="primary" onClick={() => openQuickAdd()}><Plus /> Quick add</Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="today"><Sun /> Today <Badge className="ml-1 h-5">{lists.today.length}</Badge></TabsTrigger>
          <TabsTrigger value="overdue"><AlarmClock /> Overdue {lists.overdue.length > 0 && <Badge tone="crimson" className="ml-1 h-5">{lists.overdue.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="tomorrow"><Sunrise /> Tomorrow</TabsTrigger>
          <TabsTrigger value="upcoming"><CalendarDays /> Next 7 days</TabsTrigger>
          <TabsTrigger value="inbox"><Inbox /> Unscheduled</TabsTrigger>
          <TabsTrigger value="recurring"><Repeat /> Recurring</TabsTrigger>
        </TabsList>
        <Panel className="p-3">
          <TabsContent value="today">
            <QuestList quests={lists.today} today={today} empty={<EmptyState icon={<Sun />} title="A clear horizon" description="Nothing is scheduled for today. Add a quest or pull one from your inbox." action={<Button variant="primary" onClick={() => openQuickAdd()}><Plus /> Add quest</Button>} />} />
          </TabsContent>
          <TabsContent value="overdue">
            {lists.overdue.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-crimson/25 bg-[color-mix(in_oklab,var(--c-crimson)_6%,transparent)] px-4 py-3 text-sm">
                <span>Bring overdue quests into today, or rebalance a campaign from its page for a full plan adjustment.</span>
                <Button size="sm" variant="danger" onClick={() => void bulkUpdateQuests(lists.overdue.filter((q) => !q.deadlineLocked).map((q) => q.id), { scheduledDate: today })}>
                  <CalendarPlus /> Move unlocked to today
                </Button>
              </div>
            )}
            <QuestList quests={lists.overdue} today={today} empty={<EmptyState icon={<AlarmClock />} title="Nothing overdue" description="You’re on top of your commitments." />} />
          </TabsContent>
          <TabsContent value="tomorrow">
            <QuestList quests={lists.tomorrow} today={today} empty={<EmptyState icon={<Sunrise />} title="Tomorrow is open" description="Plan ahead during your daily review." />} />
          </TabsContent>
          <TabsContent value="upcoming">
            {Object.keys(upcomingByDay).length === 0 && <EmptyState icon={<CalendarDays />} title="No upcoming quests" description="Quests scheduled in the next week will appear here." />}
            {Object.entries(upcomingByDay).map(([day, list]) => (
              <section key={day} className="mb-3">
                <h3 className="px-2 pt-2 pb-1 text-xs font-bold tracking-wider text-fg-dim uppercase">{formatDateKey(day, 'EEEE, MMM d')}</h3>
                <QuestList quests={list} today={today} />
              </section>
            ))}
          </TabsContent>
          <TabsContent value="inbox">
            <QuestList quests={lists.inbox} today={today} empty={<EmptyState icon={<Inbox />} title="Inbox zero" description="Quests without a date land here." />} />
          </TabsContent>
          <TabsContent value="recurring">
            <PanelHeader className="px-2" title="Recurring quests" eyebrow="Daily & weekly rituals" />
            {recurrences.length === 0 && (
              <EmptyState icon={<Repeat />} title="No recurring quests" description="Create a daily or weekly quest and switch on “Repeat automatically”." action={<Button variant="primary" onClick={() => openEditor(undefined, { category: 'daily', difficulty: 'easy', estimatedMinutes: 20 })}><Plus /> New recurring quest</Button>} />
            )}
            <div className="space-y-1.5 px-2 pb-2">
              {recurrences.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <Repeat className="size-4 text-emerald" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{r.title}</div>
                    <div className="text-xs text-fg-muted">{describeRecurrence(r)} · {formatMinutes(r.estimatedMinutes)}{r.endDate ? ` · until ${r.endDate}` : ''}</div>
                  </div>
                  <Switch checked={r.active} onCheckedChange={(v) => void updateRecurrence(r.id, { active: v })} aria-label={`Toggle ${r.title}`} />
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.title}`} onClick={() => confirm('Delete this recurring quest and its future instances? Completed history is kept.') && void deleteRecurrence(r.id)}><Trash2 /></Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Panel>
      </Tabs>
    </div>
  );
}
