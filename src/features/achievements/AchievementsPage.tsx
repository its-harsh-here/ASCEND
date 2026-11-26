import { Coins, Flame, Gift, Lock, Pencil, Plus, ShieldCheck, Snowflake, Trash2, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RARITY_COLOR } from '@/app/Celebrations';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon, REWARD_ICONS } from '@/components/ui/icon';
import { Badge, EmptyState, Field, Input, PageHeader, Panel, ProgressBar, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { ACHIEVEMENTS, RARITY_LABEL, RARITY_XP, achievementProgress, type PlayerStats, type Rarity } from '@/domain/achievements';
import type { Reward } from '@/domain/types';
import { useAchievementUnlocks, useProfile, useRedemptions, useRewards, useToday } from '@/hooks/data';
import { useCelebrateAchievements } from '@/hooks/useQuestActions';
import { addDaysKey, formatDateKey, weekdayOf } from '@/lib/dates';
import { cn, formatNumber, orEmpty } from '@/lib/utils';
import { InsufficientCoinsError, archiveReward, redeemReward, saveReward } from '@/services/misc';
import { computeStats } from '@/services/progression';
import { useSettings } from '@/hooks/data';
import { useLiveQuery } from 'dexie-react-hooks';
import { useUI } from '@/store/ui';

const RARITY_ORDER: Rarity[] = ['legendary', 'epic', 'rare', 'common'];

export default function AchievementsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'achievements';
  return (
    <div>
      <PageHeader eyebrow="Hall of deeds" title="Achievements & Rewards" description="Unlock achievements from real progress and spend earned coins on rewards you define for yourself." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList className="mb-5">
          <TabsTrigger value="achievements"><Trophy /> Achievements</TabsTrigger>
          <TabsTrigger value="rewards"><Gift /> Reward shop</TabsTrigger>
          <TabsTrigger value="streak"><Flame /> Streak</TabsTrigger>
        </TabsList>
        <TabsContent value="achievements"><AchievementGrid /></TabsContent>
        <TabsContent value="rewards"><RewardShop /></TabsContent>
        <TabsContent value="streak"><StreakView /></TabsContent>
      </Tabs>
    </div>
  );
}

function AchievementGrid() {
  const unlocks = orEmpty(useAchievementUnlocks());
  // Re-derive stats whenever the XP ledger or unlocks change.
  const stats = useLiveQuery(() => computeStats(), [unlocks.length]) as PlayerStats | undefined;
  const map = new Map(unlocks.map((u) => [u.id, u.unlockedAt]));
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const list = ACHIEVEMENTS.filter((a) => filter === 'all' || (filter === 'unlocked' ? map.has(a.id) : !map.has(a.id))).sort(
    (a, b) => Number(map.has(b.id)) - Number(map.has(a.id)) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge tone="gold" className="h-8 px-3 text-sm"><Trophy /> {unlocks.length} / {ACHIEVEMENTS.length} unlocked</Badge>
        {(['all', 'unlocked', 'locked'] as const).map((f) => <Button key={f} size="xs" variant={filter === f ? 'outline' : 'ghost'} onClick={() => setFilter(f)} className="capitalize">{f}</Button>)}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a, i) => {
          const at = map.get(a.id);
          const color = RARITY_COLOR[a.rarity];
          const prog = stats ? achievementProgress(a, stats) : { current: 0, ratio: 0 };
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.5) }}
              className={cn('panel relative flex gap-4 overflow-hidden p-4', !at && 'opacity-70')} style={at ? { borderColor: `color-mix(in oklab, ${color} 40%, transparent)` } : undefined} data-testid="achievement-card">
              {at && a.rarity === 'legendary' && <span className="absolute inset-y-0 w-1/2 animate-shimmer bg-[linear-gradient(90deg,transparent,var(--shine-gold),transparent)]" />}
              <div className="relative grid size-14 shrink-0 rotate-45 place-items-center rounded-[14px] border-2" style={{ borderColor: at ? color : 'var(--line-strong)', boxShadow: at ? `0 0 24px -6px ${color}` : undefined, background: at ? `color-mix(in oklab, ${color} 10%, var(--surface))` : 'var(--surface-2)' }}>
                <span className="-rotate-45" style={{ color: at ? color : 'var(--fg-dim)' }}>{at ? <Icon name={a.icon} className="size-6" /> : <Lock className="size-5" />}</span>
              </div>
              <div className="relative min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[0.6rem] font-bold tracking-[0.18em] uppercase" style={{ color }}>{RARITY_LABEL[a.rarity]}</span>
                  <span className="font-num text-[0.65rem] text-gold">+{RARITY_XP[a.rarity]} XP</span>
                </div>
                <div className="truncate font-display font-semibold">{a.title}</div>
                <div className="text-xs text-fg-muted">{a.description}</div>
                {at ? (
                  <div className="mt-2 text-[0.7rem] text-fg-dim">Unlocked {formatDateKey(at.slice(0, 10), 'MMM d, yyyy')}</div>
                ) : (
                  <div className="mt-2">
                    <ProgressBar value={prog.ratio} height={4} tone="gold" label={`${a.title} progress`} />
                    <div className="mt-1 font-num text-[0.65rem] text-fg-dim">{formatNumber(prog.current)} / {formatNumber(a.target)}</div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}

function RewardShop() {
  const rewards = orEmpty(useRewards());
  const redemptions = orEmpty(useRedemptions());
  const profile = useProfile();
  const toast = useUI((s) => s.toast);
  const celebrateAchievements = useCelebrateAchievements();
  const [editing, setEditing] = useState<Partial<Reward> | null>(null);
  const active = rewards.filter((r) => !r.archived).sort((a, b) => a.cost - b.cost);
  const coins = profile?.coins ?? 0;

  const redeem = async (r: Reward) => {
    if (!confirm(`Redeem “${r.title}” for ${r.cost} coins?`)) return;
    try {
      celebrateAchievements(await redeemReward(r.id));
      toast({ title: `Enjoy: ${r.title}`, description: `−${r.cost} coins. You earned it.`, tone: 'gold' });
    } catch (e) {
      toast({ title: e instanceof InsufficientCoinsError ? 'Not enough coins yet' : 'Redeem failed', description: e instanceof Error ? e.message : String(e), tone: 'error' });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-gold/30 bg-[color-mix(in_oklab,var(--c-gold)_8%,transparent)] px-4 py-2.5">
            <Coins className="size-6 text-gold" />
            <div>
              <div className="font-num text-2xl font-semibold" data-testid="coin-balance">{formatNumber(coins)}</div>
              <div className="text-[0.68rem] text-fg-muted">coins · earned at 1 per 5 XP from quests</div>
            </div>
          </div>
          <Button variant="primary" onClick={() => setEditing({ title: '', cost: 100, icon: 'gift', description: '' })}><Plus /> New reward</Button>
        </div>
        {active.length === 0 ? (
          <Panel><EmptyState icon={<Gift />} title="Stock your reward shop" description="Define real-life treats — a movie night, a gaming break, a day off. Redeeming is virtual bookkeeping; nothing is purchased." action={<Button variant="primary" onClick={() => setEditing({ title: '', cost: 100, icon: 'gift', description: '' })}><Plus /> Create reward</Button>} /></Panel>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((r) => {
              const can = coins >= r.cost;
              return (
                <Panel key={r.id} className="group flex flex-col p-4">
                  <div className="flex items-start justify-between">
                    <span className="grid size-11 place-items-center rounded-xl border border-gold/30 bg-[color-mix(in_oklab,var(--c-gold)_10%,transparent)] text-gold"><Icon name={r.icon} className="size-5" /></span>
                    <div className="flex opacity-0 transition group-hover:opacity-100">
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.title}`}><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => void archiveReward(r.id)} aria-label={`Remove ${r.title}`}><Trash2 /></Button>
                    </div>
                  </div>
                  <div className="mt-3 font-semibold">{r.title}</div>
                  {r.description && <div className="mt-0.5 text-xs text-fg-muted">{r.description}</div>}
                  {!can && <ProgressBar value={coins / r.cost} height={3} tone="gold" className="mt-3" label="Saved toward reward" />}
                  <Button variant={can ? 'gold' : 'secondary'} size="sm" className="mt-auto translate-y-0 pt-0" style={{ marginTop: 14 }} disabled={!can} onClick={() => void redeem(r)}>
                    <Coins /> {r.cost} {can ? '· Redeem' : `· ${r.cost - coins} to go`}
                  </Button>
                </Panel>
              );
            })}
          </div>
        )}
      </div>
      <Panel className="p-4">
        <div className="eyebrow mb-3">Redemption history</div>
        {redemptions.length === 0 && <p className="text-xs text-fg-dim">Nothing redeemed yet.</p>}
        {redemptions.slice(0, 30).map((r) => (
          <div key={r.id} className="flex items-center gap-2 border-b border-line py-2 text-sm last:border-0">
            <Gift className="size-3.5 text-gold" />
            <span className="min-w-0 flex-1 truncate">{r.title}</span>
            <span className="font-num text-xs text-fg-muted">−{r.cost}</span>
            <span className="text-[0.65rem] text-fg-dim">{formatDateKey(r.redeemedAt.slice(0, 10), 'MMM d')}</span>
          </div>
        ))}
      </Panel>
      <RewardDialog draft={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function RewardDialog({ draft, onClose }: { draft: Partial<Reward> | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Reward>>({});
  const [last, setLast] = useState<Partial<Reward> | null>(null);
  if (draft !== last) {
    setLast(draft);
    if (draft) setForm(draft);
  }
  const save = async () => {
    if (!form.title?.trim() || !form.cost || form.cost < 1) return;
    await saveReward({ ...form, title: form.title.trim(), cost: Math.round(form.cost) } as Reward);
    onClose();
  };
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()} title={form.id ? 'Edit reward' : 'New reward'} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save reward</Button></>}>
      <div className="space-y-3">
        <Field label="Reward" htmlFor="rw-t"><Input id="rw-t" autoFocus value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Watch a movie" /></Field>
        <Field label="Description" htmlFor="rw-d"><Textarea id="rw-d" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-16" /></Field>
        <Field label="Cost (coins)" htmlFor="rw-c"><Input id="rw-c" type="number" min={1} value={form.cost ?? 100} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></Field>
        <div className="flex flex-wrap gap-2">
          {REWARD_ICONS.map((i) => <button key={i} onClick={() => setForm({ ...form, icon: i })} aria-label={i} aria-pressed={form.icon === i} className={cn('grid size-9 place-items-center rounded-lg border', form.icon === i ? 'border-gold text-gold' : 'border-line text-fg-muted')}><Icon name={i} className="size-4" /></button>)}
        </div>
      </div>
    </Dialog>
  );
}

function StreakView() {
  const profile = useProfile();
  const settings = useSettings();
  const today = useToday();
  const days = useMemo(() => Array.from({ length: 35 }, (_, i) => addDaysKey(today, i - 34)), [today]);
  if (!profile || !settings) return null;
  const { streak } = profile;
  const frozen = new Set(streak.frozenDates);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Panel runes className="p-6 text-center">
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="mx-auto grid size-28 place-items-center rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--c-gold)_30%,transparent),transparent_70%)]">
          <Flame className="size-14 text-gold" fill={streak.activeToday ? 'currentColor' : 'none'} />
        </motion.div>
        <div className="mt-2 font-num text-5xl font-bold">{streak.current}</div>
        <div className="text-sm text-fg-muted">day streak {streak.activeToday ? '· today counted' : '· complete a quest today to extend it'}</div>
        <div className="mt-6 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-line p-3"><div className="font-num text-xl font-semibold">{streak.longest}</div><div className="text-[0.68rem] text-fg-dim">longest</div></div>
          <div className="rounded-xl border border-line p-3"><div className="flex items-center justify-center gap-1 font-num text-xl font-semibold text-cyan"><Snowflake className="size-4" />{streak.freezesAvailable}</div><div className="text-[0.68rem] text-fg-dim">freezes ready</div></div>
          <div className="rounded-xl border border-line p-3"><div className="font-num text-xl font-semibold">{Math.round(profile.consistency * 100)}%</div><div className="text-[0.68rem] text-fg-dim">7-day consistency</div></div>
        </div>
      </Panel>
      <Panel className="p-5">
        <div className="eyebrow mb-3">Last 5 weeks</div>
        <div className="grid grid-cols-7 gap-1.5">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="text-center text-[0.62rem] text-fg-dim">{d}</div>)}
          {Array.from({ length: (weekdayOf(days[0]) + 6) % 7 }, (_, i) => <span key={`pad${i}`} />)}
          {days.map((d) => {
            const active = profile.activeDates.has(d);
            const rest = !settings.workdays.includes(weekdayOf(d));
            return (
              <div key={d} title={d} className={cn('grid aspect-square place-items-center rounded-lg border text-[0.7rem] font-semibold', active ? 'border-gold/50 bg-[color-mix(in_oklab,var(--c-gold)_18%,transparent)] text-gold' : frozen.has(d) ? 'border-cyan/50 text-cyan' : rest ? 'border-dashed border-line text-fg-dim' : 'border-line text-fg-dim', d === today && 'ring-1 ring-accent')}>
                {frozen.has(d) ? <Snowflake className="size-3.5" /> : Number(d.slice(8))}
              </div>
            );
          })}
        </div>
        <ul className="mt-5 space-y-2 text-sm text-fg-muted">
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald" /> Days outside your workdays are rest days — they never break your streak.</li>
          <li className="flex gap-2"><Snowflake className="mt-0.5 size-4 shrink-0 text-cyan" /> Every 7 active days earns a streak freeze (max 2) that automatically covers one missed workday.</li>
          <li className="flex gap-2"><Flame className="mt-0.5 size-4 shrink-0 text-gold" /> A day counts when you complete a quest or at least 5 minutes of focus.</li>
        </ul>
      </Panel>
    </div>
  );
}
