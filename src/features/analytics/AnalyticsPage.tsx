import { AlarmClock, BarChart3, CheckCircle2, Gauge, Lightbulb, Table2, Timer, Zap } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { Heatmap, StatTile } from '@/components/game/widgets';
import { EmptyState, PageHeader, Panel, PanelHeader, Segmented } from '@/components/ui/primitives';
import { aggregate, completionByDifficulty, completionRate, dailySeries, heatmap, insights, missedDeadlines, plannedVsActual, timePerCampaign } from '@/domain/analytics';
import { computeSkillProgress } from '@/domain/skills';
import { DIFFICULTY_LABEL } from '@/domain/types';
import { useCampaigns, useFocusSessions, useQuests, useToday, useXpEvents } from '@/hooks/data';
import { addDaysKey, formatDateKey } from '@/lib/dates';
import { formatMinutes, formatNumber, orEmpty } from '@/lib/utils';

type Range = '30' | '90' | '365';
type Grain = 'day' | 'week' | 'month';

const axis = { stroke: 'var(--line)', tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, unit }: TooltipProps<number, string> & { unit?: (v: number, name: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line-strong bg-surface-3 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-fg">{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-fg-muted">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-num text-fg">{unit ? unit(Number(p.value), String(p.name)) : formatNumber(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

function ChartPanel({ title, eyebrow, icon, children, actions, empty }: { title: string; eyebrow?: string; icon: ReactNode; children: ReactNode; actions?: ReactNode; empty?: boolean }) {
  return (
    <Panel className="flex flex-col">
      <PanelHeader title={title} eyebrow={eyebrow} icon={icon} actions={actions} />
      <div className="min-h-0 flex-1 px-3 pb-4">{empty ? <p className="py-14 text-center text-sm text-fg-dim">No recorded data in this range yet.</p> : children}</div>
    </Panel>
  );
}

export default function AnalyticsPage() {
  const events = useXpEvents();
  const sessions = useFocusSessions();
  const quests = useQuests();
  const campaigns = orEmpty(useCampaigns());
  const today = useToday();
  const [range, setRange] = useState<Range>('30');
  const [grain, setGrain] = useState<Grain>('day');
  const [table, setTable] = useState(false);
  const from = addDaysKey(today, -(Number(range) - 1));

  const data = useMemo(() => {
    if (!events || !sessions || !quests) return null;
    const series = dailySeries(events, sessions, quests, from, today);
    const rangeQuests = quests.filter((q) => !q.completedAt || q.completedAt.slice(0, 10) >= from);
    const xpSeries = grain === 'day' ? series.map((s) => ({ ...s, label: formatDateKey(s.date, 'MMM d') })) : aggregate(series, grain);
    const skills = [...computeSkillProgress(events.filter((e) => e.date >= from)).values()].filter((p) => p.xp > 0).sort((a, b) => b.xp - a.xp).slice(0, 10);
    const missed = missedDeadlines(quests, today);
    return {
      series,
      xpSeries,
      totalXp: series.reduce((a, s) => a + s.xp, 0),
      questsDone: series.reduce((a, s) => a + s.quests, 0),
      focusMin: series.reduce((a, s) => a + s.focusMinutes, 0),
      completion: completionRate(quests, from, today),
      byDifficulty: completionByDifficulty(rangeQuests).filter((d) => d.total > 0).map((d) => ({ ...d, label: DIFFICULTY_LABEL[d.difficulty], rate: Math.round((d.done / d.total) * 100) })),
      pva: plannedVsActual(quests, from).map((w) => ({ ...w, planned: Math.round((w.planned / 60) * 10) / 10, actual: Math.round((w.actual / 60) * 10) / 10 })),
      perCampaign: timePerCampaign(quests.filter((q) => (q.completedAt ?? q.updatedAt).slice(0, 10) >= from), sessions.filter((s) => s.date >= from), campaigns).slice(0, 8).map((c) => ({ ...c, hours: Math.round((c.minutes / 60) * 10) / 10 })),
      skills: skills.map((p) => ({ name: p.skill.name, xp: p.xp })),
      missedLate: missed.late.filter((q) => q.dueDate! >= from).length,
      missedOpen: missed.overduePending.length,
      insights: insights(series, quests.filter((q) => q.completedAt && q.completedAt.slice(0, 10) >= from)),
      heat: heatmap(dailySeries(events, sessions, quests, addDaysKey(today, -371), today), today, 52),
    };
  }, [events, sessions, quests, campaigns, from, today, grain]);

  if (!data) return null;
  const anyData = data.totalXp > 0 || data.focusMin > 0 || data.questsDone > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Everything here is computed from your recorded activity. Nothing is estimated or invented."
        actions={
          <>
            <Segmented ariaLabel="Range" value={range} onChange={setRange} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]} />
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="XP earned" value={formatNumber(data.totalXp)} icon={<Zap />} tone="gold" sub={`last ${range} days`} />
        <StatTile label="Quests completed" value={data.questsDone} icon={<CheckCircle2 />} tone="emerald" />
        <StatTile label="Completion rate" value={data.completion.planned ? `${Math.round(data.completion.rate * 100)}%` : '—'} icon={<Gauge />} tone="accent" sub={`${data.completion.done}/${data.completion.planned} scheduled`} />
        <StatTile label="Focus time" value={formatMinutes(data.focusMin)} icon={<Timer />} tone="cyan" />
        <StatTile label="Missed deadlines" value={data.missedLate + data.missedOpen} icon={<AlarmClock />} tone={data.missedLate + data.missedOpen ? 'crimson' : 'accent'} sub={`${data.missedLate} finished late · ${data.missedOpen} overdue`} />
      </div>

      {!anyData && <Panel className="mb-5"><EmptyState icon={<BarChart3 />} title="No activity recorded yet" description="Complete quests and focus sessions — charts fill in from real data only." /></Panel>}

      <Panel className="mb-5 p-5">
        <div className="eyebrow mb-3 flex items-center gap-2"><Lightbulb className="size-3.5 text-gold" /> Observations from your data</div>
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">{data.insights.map((t) => <li key={t} className="flex gap-2 text-sm text-fg-muted"><span className="mt-2 size-1.5 shrink-0 rotate-45 bg-gold" />{t}</li>)}</ul>
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartPanel
          title="Experience earned"
          eyebrow={grain === 'day' ? 'Daily XP' : grain === 'week' ? 'Weekly XP' : 'Monthly XP'}
          icon={<Zap />}
          empty={!data.totalXp}
          actions={<>
            <Segmented size="sm" ariaLabel="Granularity" value={grain} onChange={setGrain} options={[{ value: 'day', label: 'D' }, { value: 'week', label: 'W' }, { value: 'month', label: 'M' }]} />
            <button onClick={() => setTable(!table)} className="grid size-7 place-items-center rounded-lg text-fg-dim hover:bg-surface-2 hover:text-fg" aria-pressed={table} aria-label="Toggle data table"><Table2 className="size-4" /></button>
          </>}
        >
          {table ? (
            <div className="max-h-[260px] overflow-y-auto text-sm">
              <table className="w-full"><thead className="sticky top-0 bg-surface text-left text-xs text-fg-dim"><tr><th className="py-1.5">Period</th><th className="text-right">XP</th><th className="text-right">Quests</th><th className="text-right">Focus</th></tr></thead>
                <tbody>{data.xpSeries.map((r) => <tr key={r.date} className="border-t border-line"><td className="py-1.5">{r.label}</td><td className="text-right font-num">{r.xp}</td><td className="text-right font-num">{r.quests}</td><td className="text-right font-num">{formatMinutes(r.focusMinutes)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              {grain === 'day' ? (
                <AreaChart data={data.xpSeries} margin={{ left: -12, right: 8, top: 8 }}>
                  <defs><linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--chart-1)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" {...axis} minTickGap={24} />
                  <YAxis {...axis} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--line-strong)' }} />
                  <Area type="monotone" dataKey="xp" name="XP" stroke="var(--chart-1)" strokeWidth={2} fill="url(#xpFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} animationDuration={700} />
                </AreaChart>
              ) : (
                <BarChart data={data.xpSeries} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} width={44} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--chart-grid)' }} />
                  <Bar dataKey="xp" name="XP" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} animationDuration={700} />
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </ChartPanel>

        <ChartPanel title="Quests completed" eyebrow="Per week" icon={<CheckCircle2 />} empty={!data.questsDone}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={aggregate(data.series, 'week')} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} allowDecimals={false} width={40} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--chart-grid)' }} />
              <Bar dataKey="quests" name="Quests" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Focus hours" eyebrow="Per week" icon={<Timer />} empty={!data.focusMin}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={aggregate(data.series, 'week').map((w) => ({ ...w, hours: Math.round((w.focusMinutes / 60) * 10) / 10 }))} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip content={<ChartTooltip unit={(v) => `${v}h`} />} cursor={{ fill: 'var(--chart-grid)' }} />
              <Bar dataKey="hours" name="Focus" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Planned vs actual" eyebrow="Hours on completed, tracked quests" icon={<Gauge />} empty={!data.pva.length}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.pva} margin={{ left: -18, right: 8, top: 8 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="week" {...axis} />
              <YAxis {...axis} width={40} />
              <Tooltip content={<ChartTooltip unit={(v) => `${v}h`} />} cursor={{ fill: 'var(--chart-grid)' }} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: 'var(--fg-muted)' }} />
              <Bar dataKey="planned" name="Planned" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="actual" name="Actual" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Completion by difficulty" eyebrow="Share of quests completed" icon={<BarChart3 />} empty={!data.byDifficulty.length}>
          <ResponsiveContainer width="100%" height={Math.max(160, data.byDifficulty.length * 42)}>
            <BarChart data={data.byDifficulty} layout="vertical" margin={{ left: 8, right: 40, top: 4 }}>
              <XAxis type="number" domain={[0, 100]} {...axis} unit="%" />
              <YAxis type="category" dataKey="label" {...axis} width={80} />
              <Tooltip content={<ChartTooltip unit={(v) => `${v}%`} />} cursor={{ fill: 'var(--chart-grid)' }} />
              <Bar dataKey="rate" name="Completed" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fill: 'var(--fg-muted)', fontSize: 11, formatter: (v: number) => `${v}%` }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Time per campaign" eyebrow="Focus + logged hours" icon={<Timer />} empty={!data.perCampaign.length}>
          <ResponsiveContainer width="100%" height={Math.max(160, data.perCampaign.length * 42)}>
            <BarChart data={data.perCampaign} layout="vertical" margin={{ left: 8, right: 40, top: 4 }}>
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="name" {...axis} width={140} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />
              <Tooltip content={<ChartTooltip unit={(v) => `${v}h`} />} cursor={{ fill: 'var(--chart-grid)' }} />
              <Bar dataKey="hours" name="Hours" fill="var(--chart-2)" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Skill development" eyebrow="Skill XP gained in range" icon={<Zap />} empty={!data.skills.length}>
          <ResponsiveContainer width="100%" height={Math.max(160, data.skills.length * 36)}>
            <BarChart data={data.skills} layout="vertical" margin={{ left: 8, right: 40, top: 4 }}>
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="name" {...axis} width={150} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--chart-grid)' }} />
              <Bar dataKey="xp" name="Skill XP" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Consistency" eyebrow="Last 52 weeks" icon={<CheckCircle2 />}>
          <div className="px-2 pt-2"><Heatmap cols={data.heat} cell={10} gap={2} /></div>
        </ChartPanel>
      </div>
    </div>
  );
}
