import { CheckCircle2, Coffee, Expand, EyeOff, History, Pause, Play, RotateCcw, Shrink, Square, Timer, Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/game/widgets';
import { Badge, Field, Input, Kbd, PageHeader, Panel, PanelHeader, Segmented, Select } from '@/components/ui/primitives';
import { isPending } from '@/domain/briefing';
import { useFocusSessions, useQuests, useSettings, useToday } from '@/hooks/data';
import { useCelebrateAchievements, useQuestActions } from '@/hooks/useQuestActions';
import { addDaysKey, formatDateKey } from '@/lib/dates';
import { cn, formatMinutes, orEmpty } from '@/lib/utils';
import { updateSettings } from '@/services/core';
import { recordFocusSession } from '@/services/focus';
import { elapsedMs, remainingMs, useFocusTimer, type TimerMode } from '@/store/focusTimer';
import { useUI } from '@/store/ui';
import { chime, setVolume, startAmbience, stopAmbience, type Ambience } from './audio';

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function FocusPage() {
  const settings = useSettings();
  const quests = orEmpty(useQuests());
  const sessions = orEmpty(useFocusSessions());
  const today = useToday();
  const timer = useFocusTimer();
  const toast = useUI((s) => s.toast);
  const celebrate = useUI((s) => s.celebrate);
  const celebrateAchievements = useCelebrateAchievements();
  const { complete } = useQuestActions();
  const [, setTick] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [custom, setCustom] = useState('');
  const finalizing = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const durations = useMemo(() => ({
    focus: (settings?.focus.focusMinutes ?? 25) * 60_000,
    short: (settings?.focus.shortBreakMinutes ?? 5) * 60_000,
    long: (settings?.focus.longBreakMinutes ?? 15) * 60_000,
  }), [settings]);

  // Initialize duration from settings when idle.
  useEffect(() => {
    const s = useFocusTimer.getState();
    if (!s.runningSince && s.elapsedBeforeMs === 0 && s.durationMs !== durations[s.mode] && !custom) s.setDuration(durations[s.mode]);
  }, [durations, custom]);

  const remaining = remainingMs(timer);
  const elapsed = elapsedMs(timer);
  const running = !!timer.runningSince;

  const finalize = useCallback(async (completed: boolean) => {
    const s = useFocusTimer.getState();
    if (finalizing.current || !s.sessionStartedAt) return;
    finalizing.current = true;
    const actual = Math.min(elapsedMs(s), s.durationMs) / 60000;
    const mode = s.mode;
    s.reset();
    try {
      if (actual >= 1 || completed) {
        const r = await recordFocusSession({
          mode: mode === 'focus' ? 'focus' : 'break',
          questId: mode === 'focus' ? s.questId ?? undefined : undefined,
          plannedMinutes: s.durationMs / 60000,
          actualMinutes: actual,
          startedAt: s.sessionStartedAt!,
          endedAt: new Date().toISOString(),
          completed,
        });
        if (mode === 'focus' && r.xp > 0) celebrate({ kind: 'xp', amount: r.xp, coins: Math.round(r.xp / 5), restored: false });
        celebrateAchievements(r.achievements);
      }
      if (completed) {
        if (settings?.focus.chime) void chime(settings.focus.volume);
        if (settings?.notifications.focusEnd && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification(mode === 'focus' ? 'Focus session complete' : 'Break is over', { body: mode === 'focus' ? 'Time for a break.' : 'Ready for the next session?', icon: `${import.meta.env.BASE_URL}pwa-192.png` });
        }
        if (mode === 'focus') {
          s.incrementFocusCount();
          const count = useFocusTimer.getState().completedFocusCount;
          const next: TimerMode = settings && count % settings.focus.longBreakEvery === 0 ? 'long' : 'short';
          s.setMode(next, durations[next]);
          toast({ title: 'Focus session complete', description: `${Math.round(actual)} minutes logged.`, tone: 'success' });
          if (settings?.focus.autoStartBreaks) useFocusTimer.getState().start();
        } else {
          s.setMode('focus', durations.focus);
          toast({ title: 'Break complete', description: 'Back to the quest when you are ready.' });
        }
      } else if (actual >= 1) {
        toast({ title: 'Session stopped', description: `${Math.round(actual)} minutes logged.` });
      }
    } finally {
      finalizing.current = false;
    }
  }, [celebrate, celebrateAchievements, durations, settings, toast]);

  // Wall-clock driven ticking; also catches completion after tab suspension or reload.
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      const s = useFocusTimer.getState();
      if (s.runningSince && remainingMs(s) <= 0) void finalize(true);
    }, 250);
    const onVis = () => setTick((t) => t + 1);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [finalize]);

  useEffect(() => {
    document.title = running ? `${fmt(remaining)} · ${timer.mode === 'focus' ? 'Focus' : 'Break'} — Ascend` : 'Ascend';
    return () => { document.title = 'Ascend'; };
  }, [running, remaining, timer.mode]);

  // Ambient audio follows the timer.
  useEffect(() => {
    const kind = settings?.focus.sound ?? 'none';
    if (soundOn && running && kind !== 'none') void startAmbience(kind as Ambience, settings?.focus.volume ?? 0.4);
    else stopAmbience();
    return () => stopAmbience();
  }, [soundOn, running, settings?.focus.sound, settings?.focus.volume]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      toast({ title: 'Fullscreen not available', tone: 'error' });
    }
  };
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const startPause = useCallback(() => {
    const s = useFocusTimer.getState();
    if (s.runningSince) s.pause();
    else {
      if ('Notification' in window && Notification.permission === 'default' && settings?.notifications.focusEnd) void Notification.requestPermission();
      s.start();
    }
  }, [settings?.notifications.focusEnd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.code === 'Space') { e.preventDefault(); startPause(); }
      else if (e.key === 'r') useFocusTimer.getState().reset();
      else if (e.key === 'f') void toggleFullscreen();
      else if (e.key === 'd') useFocusTimer.getState().setDistractionFree(!useFocusTimer.getState().distractionFree);
      else if (e.key === 'm') setSoundOn((v) => !v);
      else if (e.key === 'Escape' && useFocusTimer.getState().distractionFree) useFocusTimer.getState().setDistractionFree(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPause]);

  if (!settings) return null;
  const quest = timer.questId ? quests.find((q) => q.id === timer.questId) : undefined;
  const pending = quests.filter((q) => isPending(q)).sort((a, b) => (a.scheduledDate === today ? -1 : 0) - (b.scheduledDate === today ? -1 : 0));
  const pct = timer.durationMs ? elapsed / timer.durationMs : 0;
  const modeColor = timer.mode === 'focus' ? 'var(--accent)' : 'var(--c-emerald)';

  const todaySessions = sessions.filter((s) => s.date === today && s.mode === 'focus');
  const weekStart = addDaysKey(today, -6);
  const week = sessions.filter((s) => s.mode === 'focus' && s.date >= weekStart);
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = addDaysKey(today, i - 6);
    return { d, m: sessions.filter((s) => s.mode === 'focus' && s.date === d).reduce((a, s) => a + s.actualMinutes, 0) };
  });
  const maxDay = Math.max(30, ...last7.map((x) => x.m));

  const timerView = (
    <div className="flex flex-col items-center">
      <div className="relative grid place-items-center" style={{ width: 'min(78vw, 360px)', height: 'min(78vw, 360px)' }}>
        <motion.div className="absolute inset-[8%] rounded-full blur-3xl" style={{ background: modeColor }} animate={{ opacity: running ? [0.12, 0.22, 0.12] : 0.08 }} transition={{ duration: 4, repeat: Infinity }} />
        <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="100" cy="100" r="92" fill="none" stroke="var(--surface-3)" strokeWidth="3" />
          {Array.from({ length: 60 }, (_, i) => (
            <line key={i} x1="100" y1="4" x2="100" y2={i % 5 === 0 ? 11 : 8} stroke={i / 60 < pct ? modeColor : 'var(--line-strong)'} strokeWidth={i % 5 === 0 ? 1.6 : 0.8} transform={`rotate(${i * 6} 100 100)`} />
          ))}
          <circle cx="100" cy="100" r="84" fill="none" stroke={modeColor} strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 84} strokeDashoffset={2 * Math.PI * 84 * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.25s linear', filter: `drop-shadow(0 0 6px ${modeColor})` }} />
        </svg>
        <div className="relative text-center">
          <div className="eyebrow" style={{ color: modeColor }}>{timer.mode === 'focus' ? 'Focus' : timer.mode === 'short' ? 'Short break' : 'Long break'}</div>
          <div className="mt-1 font-num text-6xl font-semibold tracking-tight md:text-7xl" role="timer" aria-live="off" aria-label={`${fmt(remaining)} remaining`} data-testid="focus-timer">{fmt(remaining)}</div>
          <div className="mt-2 max-w-[220px] truncate text-xs text-fg-muted">{quest ? quest.title : 'No quest linked'}</div>
        </div>
      </div>
      <div className="mt-6 flex items-center gap-3">
        <Button size="icon" variant="ghost" onClick={() => timer.reset()} aria-label="Reset (R)"><RotateCcw /></Button>
        <Button size="lg" variant="primary" className="h-14 min-w-40 rounded-full text-base" onClick={startPause} data-testid="focus-start">
          {running ? <><Pause /> Pause</> : <><Play /> {elapsed > 0 ? 'Resume' : 'Start'}</>}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => void finalize(false)} disabled={!timer.sessionStartedAt} aria-label="Stop and log"><Square /></Button>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[0.7rem] text-fg-dim">
        <Kbd>Space</Kbd> start/pause <Kbd>R</Kbd> reset <Kbd>F</Kbd> fullscreen <Kbd>D</Kbd> distraction-free <Kbd>M</Kbd> sound
      </div>
    </div>
  );

  if (timer.distractionFree) {
    return (
      <div ref={rootRef} className="atmosphere fixed inset-0 z-[60] flex flex-col items-center justify-center p-6">
        <button onClick={() => timer.setDistractionFree(false)} className="absolute top-5 right-5 rounded-lg px-3 py-1.5 text-xs text-fg-dim hover:text-fg">Exit (Esc)</button>
        {timerView}
        {quest && isPending(quest) && <Button variant="success" className="mt-8" onClick={() => void complete(quest.id)}><CheckCircle2 /> Complete “{quest.title}”</Button>}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn(fullscreen && 'atmosphere overflow-y-auto p-8')}>
      <PageHeader
        eyebrow="Deep work"
        title="Focus Chamber"
        description="A timestamp-based timer — accurate across sleeping tabs and reloads. Focus time adds actual minutes to the linked quest and grants focus XP."
        actions={
          <>
            <Button variant="ghost" onClick={() => timer.setDistractionFree(true)}><EyeOff /> Distraction-free</Button>
            <Button variant="ghost" onClick={() => void toggleFullscreen()}>{fullscreen ? <Shrink /> : <Expand />} {fullscreen ? 'Exit' : 'Fullscreen'}</Button>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Panel runes className="flex flex-col items-center p-6 md:p-10">
          <Segmented
            ariaLabel="Timer mode"
            value={timer.mode}
            onChange={(m) => { if (!running) { setCustom(''); timer.setMode(m, durations[m]); } }}
            options={[{ value: 'focus', label: <span className="flex items-center gap-1.5"><Timer /> Focus</span> }, { value: 'short', label: <span className="flex items-center gap-1.5"><Coffee /> Short</span> }, { value: 'long', label: <span className="flex items-center gap-1.5"><Coffee /> Long</span> }]}
            className="mb-8"
          />
          {timerView}
        </Panel>
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Session setup" eyebrow="Configure" />
            <div className="space-y-4 px-5 pb-5">
              <Field label="Linked quest" htmlFor="f-quest">
                <Select id="f-quest" value={timer.questId ?? ''} onChange={(e) => timer.setQuest(e.target.value || null)}>
                  <option value="">No quest (free focus)</option>
                  {pending.map((q) => <option key={q.id} value={q.id}>{q.scheduledDate === today ? '★ ' : ''}{q.title}</option>)}
                </Select>
              </Field>
              {quest && (
                <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-sm">
                  <div className="font-semibold">{quest.title}</div>
                  <div className="mt-1 text-xs text-fg-muted">{formatMinutes(quest.actualMinutes)} tracked of {formatMinutes(quest.estimatedMinutes)} estimated</div>
                  {isPending(quest) && <Button size="sm" variant="success" className="mt-3" onClick={() => void complete(quest.id)}><CheckCircle2 /> Complete quest</Button>}
                </div>
              )}
              <Field label="Custom duration (minutes)" htmlFor="f-custom">
                <div className="flex gap-2">
                  <Input id="f-custom" type="number" min={1} max={240} value={custom} placeholder={String(settings.focus.focusMinutes)} onChange={(e) => setCustom(e.target.value)} disabled={running} />
                  <Button variant="secondary" disabled={running || !custom} onClick={() => timer.setMode(timer.mode, Math.max(1, Math.min(240, Number(custom))) * 60_000)}>Set</Button>
                </div>
              </Field>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field label="Ambient sound (generated, original)" htmlFor="f-sound">
                  <Select id="f-sound" value={settings.focus.sound} onChange={(e) => void updateSettings({ focus: { ...settings.focus, sound: e.target.value as typeof settings.focus.sound } })}>
                    <option value="none">None</option>
                    <option value="brown">Deep brown noise</option>
                    <option value="rain">Soft rain</option>
                    <option value="drone">Ambient drone</option>
                  </Select>
                </Field>
                <Button size="icon" variant={soundOn ? 'outline' : 'ghost'} aria-label={soundOn ? 'Mute' : 'Unmute'} onClick={() => setSoundOn(!soundOn)} disabled={settings.focus.sound === 'none'}>{soundOn ? <Volume2 /> : <VolumeX />}</Button>
              </div>
              <input type="range" min={0} max={1} step={0.05} value={settings.focus.volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); void updateSettings({ focus: { ...settings.focus, volume: v } }); }} className="w-full accent-[var(--accent)]" aria-label="Volume" />
              <p className="text-[0.7rem] text-fg-dim">Session-end alerts use the browser’s Notification API when permitted; delivery in the background is not guaranteed on every platform.</p>
            </div>
          </Panel>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Focus today" value={formatMinutes(todaySessions.reduce((a, s) => a + s.actualMinutes, 0))} sub={`${todaySessions.length} sessions`} icon={<Timer />} tone="accent" />
            <StatTile label="Last 7 days" value={formatMinutes(week.reduce((a, s) => a + s.actualMinutes, 0))} sub={`avg ${formatMinutes(week.length ? week.reduce((a, s) => a + s.actualMinutes, 0) / week.length : 0)} / session`} icon={<History />} tone="cyan" />
          </div>
          <Panel className="p-4">
            <div className="mb-2 flex items-end gap-1.5" style={{ height: 80 }} role="img" aria-label="Focus minutes, last 7 days">
              {last7.map((x) => (
                <div key={x.d} className="flex flex-1 flex-col items-center gap-1">
                  <motion.div className="w-full rounded-t-md bg-[linear-gradient(180deg,var(--accent),var(--accent-2))]" initial={{ height: 0 }} animate={{ height: `${(x.m / maxDay) * 64}px` }} title={`${x.d}: ${Math.round(x.m)}m`} />
                  <span className="text-[0.6rem] text-fg-dim">{formatDateKey(x.d, 'EEEEE')}</span>
                </div>
              ))}
            </div>
            <div className="eyebrow mt-3 mb-2">Today’s sessions</div>
            <AnimatePresence initial={false}>
              {sessions.filter((s) => s.date === today).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8).map((s) => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 py-1.5 text-sm">
                  <Badge tone={s.mode === 'focus' ? 'accent' : 'emerald'}>{s.mode}</Badge>
                  <span className="min-w-0 flex-1 truncate text-fg-muted">{s.questId ? quests.find((q) => q.id === s.questId)?.title ?? 'Deleted quest' : 'Free focus'}</span>
                  <span className="font-num text-xs">{formatMinutes(s.actualMinutes)}</span>
                  {!s.completed && <span className="text-[0.65rem] text-fg-dim">stopped</span>}
                </motion.div>
              ))}
            </AnimatePresence>
            {sessions.filter((s) => s.date === today).length === 0 && <p className="text-xs text-fg-dim">No sessions yet today.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}
