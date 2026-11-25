import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlarmClock, ArrowRight, CalendarClock, CheckCircle2, Clock, Coins, Compass, Crown, Flame, Gauge, Plus, ScrollText, Shield, Sparkles,
  Swords, Target, Timer, TrendingUp, Trophy, Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/game/Avatar';
import { DifficultyBadge, XpChip } from '@/components/game/badges';
import { Heatmap, StatTile, XpBar } from '@/components/game/widgets';
import { QuestList } from '@/components/quest/QuestList';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, EmptyState, Panel, PanelHeader, ProgressBar, ProgressRing, Tooltip } from '@/components/ui/primitives';
import { db } from '@/db/schema';
import { ACHIEVEMENTS } from '@/domain/achievements';
import { dailySeries, heatmap } from '@/domain/analytics';
import { buildBriefing, isPending } from '@/domain/briefing';
import { computeSkillProgress } from '@/domain/skills';
import { DEFAULT_SETTINGS, type Campaign, type Quest, type QuestCategory } from '@/domain/types';
import { questXp } from '@/domain/xp';
import {
  useAchievementUnlocks, useCampaigns, useFocusSessions, useProfile, useQuests, useSettings, useTimeBlocks, useToday, useXpEvents,
} from '@/hooks/data';
import { useQuestActions } from '@/hooks/useQuestActions';
import { addDaysKey, diffDays, formatDateKey, minutesFromTime, relativeDayLabel, timeFromMinutes } from '@/lib/dates';
import { cn, formatMinutes, formatNumber, orEmpty } from '@/lib/utils';
import { useFocusTimer } from '@/store/focusTimer';
import { useUI } from '@/store/ui';

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } } };

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function CommandCenter() {
  const settings = useSettings();
  const profile = useProfile();
  const quests = useQuests();
  const campaigns = useCampaigns();
  const blocks = useTimeBlocks();
  const events = useXpEvents();
  const sessions = useFocusSessions();
  const unlocks = useAchievementUnlocks();
  const today = useToday();
  const ready = settings && profile && quests && campaigns && blocks && events && sessions && unlocks;
  const briefing = useMemo(() => (ready ? buildBriefing({ quests, settings, today, timeBlocks: blocks }) : null), [ready, quests, settings, today, blocks]);

  if (!ready || !briefing) return null;
  const show = (w: (typeof settings.widgets)[number]) => settings.widgets.includes(w);

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <motion.header variants={rise} className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow text-accent!">Command Center · {formatDateKey(today, 'EEEE, MMMM d')}</div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-wide md:text-[2rem]">
            {greeting()}, <span className="text-gradient-accent">{settings.playerName}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => useUI.getState().openQuickAdd()} variant="secondary"><Plus /> Quick add</Button>
          <LinkButton to="/campaigns/new" variant="primary"><Target /> New campaign</LinkButton>
        </div>
      </motion.header>

      <div className="grid gap-5 xl:grid-cols-12">
        {show('character') && (
          <motion.div variants={rise} className="xl:col-span-4">
            <CharacterPanel unlocked={unlocks.length} />
          </motion.div>
        )}
        {show('briefing') && (
          <motion.div variants={rise} className={show('character') ? 'xl:col-span-8' : 'xl:col-span-12'}>
            <BriefingPanel briefing={briefing} today={today} />
          </motion.div>
        )}
        {show('quests') && (
          <motion.div variants={rise} className="xl:col-span-7">
            <TodayPanel quests={briefing.today} today={today} />
          </motion.div>
        )}
        {show('campaigns') && (
          <motion.div variants={rise} className="xl:col-span-5">
            <CampaignsPanel campaigns={campaigns} quests={quests} today={today} />
          </motion.div>
        )}
        {show('timeline') && (
          <motion.div variants={rise} className="xl:col-span-12">
            <DayTimelinePanel quests={briefing.today} today={today} />
          </motion.div>
        )}
        {show('insights') && (
          <motion.div variants={rise} className="xl:col-span-7">
            <InsightsPanel quests={quests} today={today} briefingUpcoming={briefing.upcoming.length} />
          </motion.div>
        )}
        {show('heatmap') && (
          <motion.div variants={rise} className="xl:col-span-5">
            <HeatmapPanel today={today} />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function CharacterPanel({ unlocked }: { unlocked: number }) {
  const settings = useSettings();
  const profile = useProfile();
  const events = orEmpty(useXpEvents());
  const top = useMemo(() => [...computeSkillProgress(events).values()].filter((p) => p.xp > 0).sort((a, b) => b.xp - a.xp)[0], [events]);
  if (!settings || !profile) return null;
  const { level, streak } = profile;
  return (
    <Panel runes className="relative h-full overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_70%)]" />
      <div className="relative flex items-center gap-4">
        <Avatar id={settings.avatarId} size={76} />
        <div className="min-w-0">
          <div className="eyebrow">Character</div>
          <div className="truncate font-display text-xl font-semibold">{settings.playerName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="gold"><Crown /> Level <span data-testid="character-level">{level.level}</span></Badge>
            {settings.showTitle && <Badge tone="accent"><Shield /> {level.title}</Badge>}
          </div>
        </div>
      </div>
      <div className="relative mt-5">
        <XpBar into={level.xpIntoLevel} needed={level.xpForNext} level={level.level} />
        <div className="mt-1.5 flex justify-between text-[0.7rem] text-fg-dim">
          <span><span className="font-num text-fg-muted" data-testid="character-total-xp">{formatNumber(profile.totalXp)}</span> total XP</span>
          <span>{formatNumber(level.xpForNext - level.xpIntoLevel)} XP to level {level.level + 1}</span>
        </div>
        {level.nextTitle && <p className="mt-1 text-[0.7rem] text-fg-dim">Next title “{level.nextTitle.title}” at level {level.nextTitle.level}</p>}
      </div>
      <div className="relative mt-5 grid grid-cols-2 gap-2.5">
        <MiniStat icon={<Flame />} tone="text-gold" label="Streak" value={`${streak.current}d`} sub={streak.freezesAvailable ? `${streak.freezesAvailable} freeze ready` : `best ${streak.longest}d`} />
        <MiniStat icon={<Gauge />} tone="text-emerald" label="Weekly consistency" value={`${Math.round(profile.consistency * 100)}%`} sub="of planned workdays" />
        <MiniStat icon={<Trophy />} tone="text-accent" label="Achievements" value={`${unlocked}/${ACHIEVEMENTS.length}`} sub={<Link to="/achievements" className="hover:text-accent">View hall</Link>} />
        <MiniStat icon={<Sparkles />} tone="text-cyan" label="Specialization" value={top ? top.skill.name : '—'} sub={top ? `${top.rankName} · ${formatNumber(top.xp)} XP` : 'Complete quests to grow skills'} small />
      </div>
      <div className="relative mt-3 flex items-center justify-between rounded-[12px] border border-line bg-surface-2/60 px-3 py-2">
        <span className="flex items-center gap-2 text-xs text-fg-muted"><Coins className="size-4 text-gold" /> Coins</span>
        <Link to="/achievements?tab=rewards" className="font-num text-sm font-semibold hover:text-gold">{formatNumber(profile.coins)} →</Link>
      </div>
    </Panel>
  );
}

function MiniStat({ icon, label, value, sub, tone, small }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone: string; small?: boolean }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface-2/60 p-3">
      <div className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wider text-fg-dim uppercase">
        <span className={cn('[&_svg]:size-3.5', tone)}>{icon}</span>
        {label}
      </div>
      <div className={cn('mt-1 truncate font-semibold', small ? 'text-sm' : 'font-num text-lg')}>{value}</div>
      {sub && <div className="truncate text-[0.68rem] text-fg-dim">{sub}</div>}
    </div>
  );
}

function BriefingPanel({ briefing, today }: { briefing: ReturnType<typeof buildBriefing>; today: string }) {
  const settings = useSettings() ?? DEFAULT_SETTINGS;
  const navigate = useNavigate();
  const { complete } = useQuestActions();
  const openEditor = useUI((s) => s.openEditor);
  const setQuest = useFocusTimer((s) => s.setQuest);
  const rec = briefing.recommended;
  const remaining = Math.max(0, briefing.availableMinutes - briefing.plannedMinutes);
  return (
    <Panel className="h-full p-0">
      <PanelHeader eyebrow="Daily briefing" title="Your situation report" icon={<ScrollText />} actions={<Link to="/reviews" className="text-xs font-semibold text-fg-muted hover:text-accent">Daily review →</Link>} />
      <div className="grid gap-4 px-5 pb-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <ul className="space-y-2" data-testid="briefing-lines">
            {briefing.lines.map((l, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-fg-muted">
                <span className="mt-2 size-1.5 shrink-0 rotate-45 bg-accent" />
                {l}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-[10px] border border-line bg-surface-2/50 p-2.5">
              <div className="text-[0.62rem] font-semibold tracking-wider text-fg-dim uppercase">Available</div>
              <div className="font-num text-base font-semibold">{formatMinutes(briefing.availableMinutes)}</div>
            </div>
            <div className="rounded-[10px] border border-line bg-surface-2/50 p-2.5">
              <div className="text-[0.62rem] font-semibold tracking-wider text-fg-dim uppercase">Planned</div>
              <div className={cn('font-num text-base font-semibold', briefing.plannedMinutes > briefing.availableMinutes && 'text-crimson')}>{formatMinutes(briefing.plannedMinutes)}</div>
            </div>
            <div className="rounded-[10px] border border-line bg-surface-2/50 p-2.5">
              <div className="text-[0.62rem] font-semibold tracking-wider text-fg-dim uppercase">Free</div>
              <div className="font-num text-base font-semibold text-emerald">{formatMinutes(remaining)}</div>
            </div>
          </div>
          {(briefing.overdue.length > 0 || briefing.upcoming.length > 0) && (
            <div className="mt-4 space-y-1.5">
              {briefing.overdue.slice(0, 2).map((q) => (
                <button key={q.id} onClick={() => openEditor(q.id)} className="flex w-full items-center gap-2 rounded-lg border border-crimson/25 bg-[color-mix(in_oklab,var(--c-crimson)_7%,transparent)] px-3 py-2 text-left text-xs">
                  <AlarmClock className="size-3.5 shrink-0 text-crimson" />
                  <span className="flex-1 truncate font-semibold">{q.title}</span>
                  <span className="text-crimson">Overdue</span>
                </button>
              ))}
              {briefing.upcoming.slice(0, 3).map((q) => (
                <button key={q.id} onClick={() => openEditor(q.id)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-xs hover:bg-surface-2">
                  <CalendarClock className="size-3.5 shrink-0 text-gold" />
                  <span className="flex-1 truncate">{q.title}</span>
                  <span className="text-fg-muted">{relativeDayLabel(q.dueDate!, today)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative overflow-hidden rounded-[14px] border border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[linear-gradient(160deg,color-mix(in_oklab,var(--accent)_12%,transparent),transparent_60%)] p-4">
          <div className="eyebrow text-accent!">Recommended next quest</div>
          {rec ? (
            <>
              <h3 className="mt-2 font-display text-lg leading-snug font-semibold" data-testid="recommended-quest">{rec.quest.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <DifficultyBadge difficulty={rec.quest.difficulty} />
                <XpChip xp={questXp(rec.quest, settings)} />
                <span className="inline-flex items-center gap-1 text-xs text-fg-muted"><Clock className="size-3" />{formatMinutes(rec.quest.estimatedMinutes)}</span>
              </div>
              <p className="mt-3 text-xs text-fg-muted">Why: {rec.reasons.join(' · ')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="primary" onClick={() => { setQuest(rec.quest.id); navigate('/focus'); }}><Timer /> Focus on it</Button>
                <Button size="sm" variant="success" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); void complete(rec.quest.id, { x: r.left + r.width / 2, y: r.top }); }}><CheckCircle2 /> Complete</Button>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-fg-muted">
              Nothing pending — {briefing.completedToday.length ? 'you cleared today. Rest or plan tomorrow.' : 'add a quest or start a campaign.'}
              <div className="mt-3"><Button size="sm" variant="outline" onClick={() => useUI.getState().openQuickAdd()}><Zap /> Add a quest</Button></div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

const GROUPS: { title: string; cats: QuestCategory[]; icon: ReactNode }[] = [
  { title: 'Boss quests', cats: ['boss', 'legendary'], icon: <Swords className="text-crimson" /> },
  { title: 'Main quests', cats: ['main'], icon: <ScrollText className="text-accent" /> },
  { title: 'Side quests', cats: ['side'], icon: <Sparkles className="text-cyan" /> },
  { title: 'Daily & weekly quests', cats: ['daily', 'weekly'], icon: <Compass className="text-emerald" /> },
];

function TodayPanel({ quests, today }: { quests: Quest[]; today: string }) {
  const done = quests.filter((q) => q.status === 'done').length;
  return (
    <Panel className="h-full">
      <PanelHeader
        eyebrow={`${done}/${quests.length} complete`}
        title="Today’s quests"
        icon={<Swords />}
        actions={<LinkButton to="/today" size="xs" variant="ghost">Open <ArrowRight /></LinkButton>}
      />
      <div className="px-3 pb-4">
        {quests.length === 0 ? (
          <EmptyState icon={<Swords />} title="No quests today" description="Use quick add or let a campaign schedule your work." action={<Button variant="primary" size="sm" onClick={() => useUI.getState().openQuickAdd()}><Plus /> Add quest</Button>} />
        ) : (
          GROUPS.map((g) => {
            const list = quests.filter((q) => g.cats.includes(q.category)).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));
            if (!list.length) return null;
            return (
              <section key={g.title} className="mb-2">
                <h3 className="flex items-center gap-2 px-2 pt-2 pb-1 text-[0.68rem] font-bold tracking-[0.16em] text-fg-dim uppercase [&_svg]:size-3.5">
                  {g.icon} {g.title} <span className="font-num">{list.filter((q) => q.status === 'done').length}/{list.length}</span>
                </h3>
                <QuestList quests={list} today={today} />
              </section>
            );
          })
        )}
      </div>
    </Panel>
  );
}

export function campaignProgress(c: Campaign, quests: Quest[]) {
  const list = quests.filter((q) => q.campaignId === c.id && q.origin !== 'recurring' && !q.archivedAt);
  const required = list.filter((q) => !q.optional);
  const done = required.filter((q) => q.status === 'done' || q.status === 'skipped').length;
  const hours = required.reduce((s, q) => s + q.estimatedMinutes, 0);
  const doneHours = required.filter((q) => q.status === 'done').reduce((s, q) => s + q.estimatedMinutes, 0);
  return { total: required.length, done, ratio: required.length ? done / required.length : 0, hours, doneHours, all: list };
}

function CampaignsPanel({ campaigns, quests, today }: { campaigns: Campaign[]; quests: Quest[]; today: string }) {
  const active = campaigns.filter((c) => c.status === 'active');
  const milestones = orEmpty(useLiveQuery(() => db.milestones.toArray(), []));
  return (
    <Panel className="h-full">
      <PanelHeader eyebrow={`${active.length} active`} title="Campaign progress" icon={<Target />} actions={<LinkButton to="/campaigns" size="xs" variant="ghost">All <ArrowRight /></LinkButton>} />
      <div className="space-y-2.5 px-4 pb-5">
        {active.length === 0 && <EmptyState icon={<Target />} title="No active campaigns" description="Turn a big goal into a scheduled roadmap." action={<LinkButton to="/campaigns/new" size="sm" variant="primary">Create campaign</LinkButton>} />}
        {active.slice(0, 4).map((c) => {
          const p = campaignProgress(c, quests);
          const total = diffDays(c.endDate, c.startDate) + 1;
          const elapsed = Math.min(total, Math.max(0, diffDays(today, c.startDate) + 1));
          const behind = p.ratio + 0.1 < elapsed / total;
          const nextMs = milestones.filter((m) => m.campaignId === c.id && m.dueDate && m.dueDate >= today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
          return (
            <Link key={c.id} to={`/campaigns/${c.id}`} className="group flex items-center gap-4 rounded-[14px] border border-line bg-surface-2/50 p-3.5 transition hover:border-line-strong hover:bg-surface-2">
              <ProgressRing value={p.ratio} size={58} stroke={5} tone={behind ? 'var(--c-gold)' : 'var(--accent)'}>
                <span className="font-num text-xs font-bold">{Math.round(p.ratio * 100)}%</span>
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold group-hover:text-accent">{c.name}</div>
                <div className="mt-0.5 text-xs text-fg-muted">
                  {p.done}/{p.total} quests · day {elapsed}/{total}
                  {behind && <span className="ml-1.5 text-gold">· behind pace</span>}
                </div>
                {nextMs && <div className="mt-1 truncate text-[0.7rem] text-fg-dim">Next milestone: {nextMs.title} · {relativeDayLabel(nextMs.dueDate!, today)}</div>}
                <ProgressBar value={elapsed / total} height={3} tone="cyan" className="mt-2 opacity-60" label="Time elapsed" />
              </div>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

function DayTimelinePanel({ quests, today }: { quests: Quest[]; today: string }) {
  const settings = useSettings() ?? DEFAULT_SETTINGS;
  const blocks = (orEmpty(useTimeBlocks())).filter((b) => b.date === today);
  const startMin = Math.min(minutesFromTime(settings.dayStart), ...blocks.map((b) => minutesFromTime(b.start)));
  const items = useMemo(() => {
    // Fixed items: time blocks and quests with a set time; the rest are placed sequentially in free gaps.
    const fixed = [
      ...blocks.map((b) => ({ id: b.id, title: b.title, start: minutesFromTime(b.start), end: minutesFromTime(b.end), kind: 'block' as const, done: false })),
      ...quests.filter((q) => q.scheduledTime).map((q) => ({ id: q.id, title: q.title, start: minutesFromTime(q.scheduledTime!), end: minutesFromTime(q.scheduledTime!) + Math.max(15, q.estimatedMinutes), kind: q.category, done: q.status === 'done' })),
    ].sort((a, b) => a.start - b.start);
    const flowing: typeof fixed = [];
    let cursor = minutesFromTime(settings.dayStart);
    for (const q of quests.filter((x) => !x.scheduledTime).sort((a, b) => Number(b.status === 'done') - Number(a.status === 'done'))) {
      const dur = Math.max(15, q.estimatedMinutes);
      for (const f of [...fixed, ...flowing].sort((a, b) => a.start - b.start)) if (cursor < f.end && cursor + dur > f.start) cursor = f.end;
      flowing.push({ id: q.id, title: q.title, start: cursor, end: cursor + dur, kind: q.category, done: q.status === 'done' });
      cursor += dur;
    }
    return [...fixed, ...flowing];
  }, [quests, blocks, settings.dayStart]);
  const endMin = Math.max(startMin + 8 * 60, ...items.map((i) => i.end));
  const span = endMin - startMin;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = [];
  for (let m = Math.ceil(startMin / 60) * 60; m <= endMin; m += 60) hours.push(m);
  const color: Record<string, string> = { block: 'var(--fg-dim)', main: 'var(--accent)', side: 'var(--c-cyan)', daily: 'var(--c-emerald)', weekly: 'var(--c-emerald)', boss: 'var(--c-crimson)', legendary: 'var(--c-gold)' };
  const lanes: number[] = [];
  const placed = items.sort((a, b) => a.start - b.start).map((i) => {
    let lane = lanes.findIndex((end) => end <= i.start);
    if (lane === -1) lane = lanes.push(0) - 1;
    lanes[lane] = i.end;
    return { ...i, lane };
  });
  const openEditor = useUI((s) => s.openEditor);
  return (
    <Panel>
      <PanelHeader eyebrow="Planned flow" title="Daily timeline" icon={<Clock />} actions={<LinkButton to="/calendar" size="xs" variant="ghost">Calendar <ArrowRight /></LinkButton>} />
      <div className="overflow-x-auto px-5 pb-5">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-dim">Nothing planned today. Quests and calendar blocks appear here as a flow.</p>
        ) : (
          <div className="relative min-w-[720px]" style={{ height: 34 + Math.max(1, lanes.length) * 44 }}>
            {hours.map((m) => (
              <div key={m} className="absolute top-0 bottom-0 border-l border-dashed border-line" style={{ left: `${((m - startMin) / span) * 100}%` }}>
                <span className="absolute -top-0.5 left-1 font-num text-[0.62rem] text-fg-dim">{timeFromMinutes(m)}</span>
              </div>
            ))}
            {nowMin >= startMin && nowMin <= endMin && (
              <div className="absolute top-0 bottom-0 z-10 w-px bg-crimson shadow-[0_0_8px_var(--c-crimson)]" style={{ left: `${((nowMin - startMin) / span) * 100}%` }}>
                <span className="absolute -top-1 -left-1 size-2 rounded-full bg-crimson" />
              </div>
            )}
            {placed.map((i, idx) => (
              <Tooltip key={i.id} content={`${i.title} · ${timeFromMinutes(i.start)}–${timeFromMinutes(i.end)}`}>
                <motion.button
                  initial={{ opacity: 0, scaleX: 0.6 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => i.kind !== 'block' && openEditor(i.id)}
                  className={cn('absolute flex h-9 origin-left items-center overflow-hidden rounded-[9px] border px-2.5 text-left text-xs font-semibold', i.done && 'opacity-45')}
                  style={{
                    top: 22 + i.lane * 44,
                    left: `${((i.start - startMin) / span) * 100}%`,
                    width: `max(28px, calc(${((i.end - i.start) / span) * 100}% - 3px))`,
                    borderColor: `color-mix(in oklab, ${color[i.kind]} 50%, transparent)`,
                    background: i.kind === 'block' ? 'repeating-linear-gradient(135deg, var(--surface-2), var(--surface-2) 6px, var(--surface-3) 6px, var(--surface-3) 12px)' : `color-mix(in oklab, ${color[i.kind]} 16%, var(--surface))`,
                  }}
                >
                  {i.done && <CheckCircle2 className="mr-1 size-3 shrink-0 text-emerald" />}
                  <span className="truncate">{i.title}</span>
                </motion.button>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function InsightsPanel({ quests, today, briefingUpcoming }: { quests: Quest[]; today: string; briefingUpcoming: number }) {
  const events = orEmpty(useXpEvents());
  const sessions = orEmpty(useFocusSessions());
  const profile = useProfile();
  const weekStart = addDaysKey(today, -6);
  const doneToday = quests.filter((q) => q.status === 'done' && q.completedAt && new Date(q.completedAt).toDateString() === new Date().toDateString()).length;
  const doneWeek = quests.filter((q) => q.status === 'done' && q.completedAt && q.completedAt.slice(0, 10) >= weekStart).length;
  const focusToday = sessions.filter((s) => s.mode === 'focus' && s.date === today).reduce((a, s) => a + s.actualMinutes, 0);
  const focusWeek = sessions.filter((s) => s.mode === 'focus' && s.date >= weekStart).reduce((a, s) => a + s.actualMinutes, 0);
  const xpToday = events.filter((e) => !e.revoked && e.date === today).reduce((a, e) => a + e.amount, 0);
  const planned = quests.filter((q) => q.scheduledDate && q.scheduledDate >= weekStart && q.scheduledDate <= today && !q.archivedAt);
  const rate = planned.length ? planned.filter((q) => q.status === 'done').length / planned.length : null;
  if (!profile) return null;
  return (
    <Panel className="h-full">
      <PanelHeader eyebrow="Live stats" title="Productivity insights" icon={<TrendingUp />} actions={<LinkButton to="/analytics" size="xs" variant="ghost">Analytics <ArrowRight /></LinkButton>} />
      <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 sm:grid-cols-3">
        <StatTile label="Completed today" value={doneToday} sub={`${doneWeek} this week`} icon={<CheckCircle2 />} tone="emerald" />
        <StatTile label="Focus today" value={formatMinutes(focusToday)} sub={`${formatMinutes(focusWeek)} this week`} icon={<Timer />} tone="cyan" />
        <StatTile label="XP today" value={formatNumber(xpToday)} sub="from quests, focus & bonuses" icon={<Zap />} tone="gold" />
        <StatTile label="Current streak" value={`${profile.streak.current}d`} sub={`longest ${profile.streak.longest}d`} icon={<Flame />} tone="gold" />
        <StatTile label="7-day completion" value={rate === null ? '—' : `${Math.round(rate * 100)}%`} sub={rate === null ? 'no quests scheduled' : `${planned.filter((q) => q.status === 'done').length}/${planned.length} scheduled quests`} icon={<Gauge />} tone="accent" />
        <StatTile label="Upcoming deadlines" value={briefingUpcoming} sub="in the next 7 days" icon={<CalendarClock />} tone={briefingUpcoming ? 'crimson' : 'accent'} />
      </div>
      {quests.filter(isPending).length === 0 && quests.length > 0 && <p className="px-5 pb-4 text-xs text-fg-dim">All quests cleared.</p>}
    </Panel>
  );
}

function HeatmapPanel({ today }: { today: string }) {
  const events = orEmpty(useXpEvents());
  const sessions = orEmpty(useFocusSessions());
  const quests = orEmpty(useQuests());
  const cols = useMemo(() => heatmap(dailySeries(events, sessions, quests, addDaysKey(today, -26 * 7 - 7), today), today, 26), [events, sessions, quests, today]);
  return (
    <Panel className="h-full">
      <PanelHeader eyebrow="Last 26 weeks" title="Consistency" icon={<Flame />} />
      <div className="px-5 pb-5">
        <Heatmap cols={cols} cell={12} gap={3} />
      </div>
    </Panel>
  );
}
