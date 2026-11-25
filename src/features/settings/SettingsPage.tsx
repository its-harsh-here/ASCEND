import {
  AlertTriangle, Bell, Brain, Database, Download, FileJson, FileSpreadsheet, Gamepad2, HardDrive, LayoutDashboard, Loader2, Palette, RefreshCcw,
  ShieldCheck, Timer, Trash2, Upload, User, Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getProvider, loadWebLLM, webgpuSupported, type AIStatus } from '@/ai/providers';
import { AVATARS, Avatar } from '@/components/game/Avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Field, Input, PageHeader, Panel, ProgressBar, Segmented, Select, Switch } from '@/components/ui/primitives';
import { TABLE_NAMES, db, isDemoMode, setDemoMode } from '@/db/schema';
import { ACCENTS, DASHBOARD_WIDGETS, DEFAULT_SETTINGS, DIFFICULTIES, DIFFICULTY_LABEL, type Settings } from '@/domain/types';
import { useCampaigns, useSettings, useToday } from '@/hooks/data';
import { diffDays, WEEKDAY_SHORT } from '@/lib/dates';
import { cn, orEmpty } from '@/lib/utils';
import { checkIntegrity, downloadBackup, downloadQuestCsv, restoreBackup, validateBackup, type BackupFile, type IntegrityReport } from '@/services/backup';
import { requestPersistentStorage, storageEstimate, updateSettings } from '@/services/core';
import { useUI } from '@/store/ui';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: <User /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette /> },
  { id: 'schedule', label: 'Schedule', icon: <Timer /> },
  { id: 'game', label: 'Gamification', icon: <Gamepad2 /> },
  { id: 'focus', label: 'Focus', icon: <Timer /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell /> },
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard /> },
  { id: 'data', label: 'Data & backup', icon: <Database /> },
  { id: 'ai', label: 'Local AI', icon: <Brain /> },
];

const ACCENT_HEX: Record<string, string> = { violet: '#9b8cff', cyan: '#3fd8f0', gold: '#e9b44c', emerald: '#3ddc97', rose: '#f472b6', indigo: '#6d73ff' };
const WIDGET_LABEL: Record<string, string> = { character: 'Character progression', briefing: 'Daily briefing', quests: "Today's quests", campaigns: 'Campaign progress', timeline: 'Daily timeline', insights: 'Productivity insights', heatmap: 'Activity heatmap' };

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Panel id={id} className="scroll-mt-24 p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </Panel>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {hint && <div className="text-xs text-fg-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  const campaigns = orEmpty(useCampaigns());
  if (!s) return null;
  const set = (patch: Partial<Settings>) => void updateSettings(patch);
  return (
    <div>
      <PageHeader eyebrow="Configuration" title="Settings" description="All settings are stored locally on this device." />
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <div className="sticky top-24 space-y-0.5">
            {SECTIONS.map((x) => <a key={x.id} href={`#${x.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg [&_svg]:size-4">{x.icon}{x.label}</a>)}
          </div>
        </nav>
        <div className="space-y-5">
          <Section id="profile" title="Profile">
            <Field label="Display name" htmlFor="s-name"><Input id="s-name" defaultValue={s.playerName} onBlur={(e) => set({ playerName: e.target.value.trim() || 'Adventurer' })} maxLength={80} /></Field>
            <div>
              <div className="mb-2 text-[0.78rem] font-semibold text-fg-muted">Avatar emblem</div>
              <div className="flex flex-wrap gap-2">{AVATARS.map((a) => <button key={a.id} onClick={() => set({ avatarId: a.id })} aria-label={a.name} aria-pressed={s.avatarId === a.id} className={cn('rounded-xl p-1.5', s.avatarId === a.id ? 'bg-surface-3 ring-1 ring-accent' : 'hover:bg-surface-2')}><Avatar id={a.id} size={44} glow={false} /></button>)}</div>
            </div>
            <Row label="Show character title" hint="Display your title (e.g. Explorer) next to your level."><Switch checked={s.showTitle} onCheckedChange={(v) => set({ showTitle: v })} /></Row>
          </Section>

          <Section id="appearance" title="Appearance">
            <Row label="Theme" hint="Obsidian dark is the primary experience."><Segmented ariaLabel="Theme" value={s.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} /></Row>
            <Row label="Accent color">
              <div className="flex gap-2">{ACCENTS.map((a) => <button key={a} onClick={() => set({ accent: a })} aria-label={a} aria-pressed={s.accent === a} className={cn('size-8 rotate-45 rounded-md border-2 transition', s.accent === a ? 'scale-110 border-fg' : 'border-transparent')} style={{ background: ACCENT_HEX[a] }} />)}</div>
            </Row>
            <Row label="Motion" hint="Reduce animations. “System” follows your OS preference."><Segmented ariaLabel="Motion" value={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} options={[{ value: 'system', label: 'System' }, { value: 'reduce', label: 'Reduced' }, { value: 'full', label: 'Full' }]} /></Row>
          </Section>

          <Section id="schedule" title="Schedule" description="Defaults for new campaigns and the daily briefing.">
            <Row label="Daily working hours"><Input type="number" min={0.25} max={16} step={0.25} defaultValue={s.dailyHours} onBlur={(e) => set({ dailyHours: Math.max(0.25, Math.min(16, Number(e.target.value) || 4)) })} className="w-24" /></Row>
            <Row label="Day starts at" hint="Used to lay out the daily timeline."><Input type="time" defaultValue={s.dayStart} onBlur={(e) => e.target.value && set({ dayStart: e.target.value })} className="w-32" /></Row>
            <Row label="Preferred workdays" hint="Other days are rest days and never break streaks.">
              <div className="flex gap-1">{WEEKDAY_SHORT.map((d, i) => <button key={d} aria-pressed={s.workdays.includes(i)} onClick={() => set({ workdays: s.workdays.includes(i) ? s.workdays.filter((x) => x !== i) : [...s.workdays, i].sort() })} className={cn('h-8 w-10 rounded-md border text-xs font-semibold', s.workdays.includes(i) ? 'border-accent text-fg' : 'border-line text-fg-dim')}>{d}</button>)}</div>
            </Row>
            <Row label="Default campaign" hint="Preselected for new quests and shown in the top bar.">
              <Select value={s.defaultCampaignId ?? ''} onChange={(e) => set({ defaultCampaignId: e.target.value || undefined })} className="w-56"><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            </Row>
          </Section>

          <Section id="game" title="Gamification" description="Tune rewards. Changes apply to future completions; earned XP is never rewritten.">
            <Row label="Global XP multiplier"><Input type="number" min={0.1} max={10} step={0.1} defaultValue={s.xpMultiplier} onBlur={(e) => set({ xpMultiplier: Math.max(0.1, Math.min(10, Number(e.target.value) || 1)) })} className="w-24" /></Row>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {DIFFICULTIES.map((d) => <Field key={d} label={DIFFICULTY_LABEL[d]} htmlFor={`xp-${d}`}><Input id={`xp-${d}`} type="number" min={0} defaultValue={s.difficultyXp[d]} onBlur={(e) => set({ difficultyXp: { ...s.difficultyXp, [d]: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} /></Field>)}
            </div>
            <Row label="Focus XP per minute"><Input type="number" min={0} max={10} step={0.1} defaultValue={s.focusXpPerMinute} onBlur={(e) => set({ focusXpPerMinute: Math.max(0, Number(e.target.value) || 0) })} className="w-24" /></Row>
            <Row label="Streak protection" hint="Earn a freeze every 7 active days (max 2) that covers one missed workday."><Switch checked={s.streakFreezesEnabled} onCheckedChange={(v) => set({ streakFreezesEnabled: v })} /></Row>
            <Button size="sm" variant="ghost" onClick={() => set({ xpMultiplier: 1, difficultyXp: DEFAULT_SETTINGS.difficultyXp, focusXpPerMinute: DEFAULT_SETTINGS.focusXpPerMinute })}><RefreshCcw /> Restore defaults</Button>
          </Section>

          <Section id="focus" title="Focus timer">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Focus (min)" htmlFor="f1"><Input id="f1" type="number" min={1} max={240} defaultValue={s.focus.focusMinutes} onBlur={(e) => set({ focus: { ...s.focus, focusMinutes: Math.max(1, Number(e.target.value) || 25) } })} /></Field>
              <Field label="Short break" htmlFor="f2"><Input id="f2" type="number" min={1} max={60} defaultValue={s.focus.shortBreakMinutes} onBlur={(e) => set({ focus: { ...s.focus, shortBreakMinutes: Math.max(1, Number(e.target.value) || 5) } })} /></Field>
              <Field label="Long break" htmlFor="f3"><Input id="f3" type="number" min={1} max={120} defaultValue={s.focus.longBreakMinutes} onBlur={(e) => set({ focus: { ...s.focus, longBreakMinutes: Math.max(1, Number(e.target.value) || 15) } })} /></Field>
              <Field label="Long break every" htmlFor="f4"><Input id="f4" type="number" min={1} max={12} defaultValue={s.focus.longBreakEvery} onBlur={(e) => set({ focus: { ...s.focus, longBreakEvery: Math.max(1, Number(e.target.value) || 4) } })} /></Field>
            </div>
            <Row label="Auto-start breaks"><Switch checked={s.focus.autoStartBreaks} onCheckedChange={(v) => set({ focus: { ...s.focus, autoStartBreaks: v } })} /></Row>
            <Row label="Completion chime"><Switch checked={s.focus.chime} onCheckedChange={(v) => set({ focus: { ...s.focus, chime: v } })} /></Row>
          </Section>

          <Section id="notifications" title="Notifications" description="In-app reminders. Browser notifications are only used for focus-session endings, with permission, and are not guaranteed in the background.">
            {(['overdue', 'deadlines', 'backup', 'achievements', 'focusEnd'] as const).map((k) => (
              <Row key={k} label={{ overdue: 'Overdue quests', deadlines: 'Upcoming deadlines', backup: 'Backup reminders', achievements: 'Achievement unlocks', focusEnd: 'Focus session end' }[k]}>
                <Switch checked={s.notifications[k]} onCheckedChange={(v) => set({ notifications: { ...s.notifications, [k]: v } })} />
              </Row>
            ))}
          </Section>

          <Section id="dashboard" title="Dashboard widgets">
            {DASHBOARD_WIDGETS.map((w) => <Row key={w} label={WIDGET_LABEL[w]}><Switch checked={s.widgets.includes(w)} onCheckedChange={(v) => set({ widgets: v ? DASHBOARD_WIDGETS.filter((x) => x === w || s.widgets.includes(x)) : s.widgets.filter((x) => x !== w) })} /></Row>)}
          </Section>

          <DataSection settings={s} />
          <AiSection settings={s} />
        </div>
      </div>
    </div>
  );
}

function DataSection({ settings: s }: { settings: Settings }) {
  const toast = useUI((st) => st.toast);
  const today = useToday();
  const fileRef = useRef<HTMLInputElement>(null);
  const [estimate, setEstimate] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; counts: Record<string, number>; warnings: string[] } | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [resetText, setResetText] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => { void storageEstimate().then(setEstimate); }, []);
  const age = s.lastBackupAt ? diffDays(today, s.lastBackupAt.slice(0, 10)) : null;

  const onFile = async (f: File) => {
    try {
      const v = validateBackup(JSON.parse(await f.text()));
      if (!v.ok) return toast({ title: 'Backup rejected', description: v.errors.slice(0, 3).join(' · '), tone: 'error' });
      setPending({ backup: v.backup, counts: v.counts as Record<string, number>, warnings: v.warnings });
    } catch {
      toast({ title: 'Could not read file', description: 'The file is not valid JSON.', tone: 'error' });
    }
  };

  return (
    <Section id="data" title="Data & backup" description="Your journal lives in this browser’s IndexedDB. It is not synced anywhere.">
      <div className="flex gap-3 rounded-xl border border-gold/30 bg-[color-mix(in_oklab,var(--c-gold)_7%,transparent)] p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="text-fg-muted"><b className="text-fg">Local storage is not a cloud backup.</b> Clearing site data, private browsing, uninstalling the app or browser storage eviction can erase everything. Export a backup regularly and keep it somewhere safe.</div>
      </div>
      <Row label="Storage" hint={estimate ? `${(estimate.usage / 1024 / 1024).toFixed(2)} MB used${estimate.quota ? ` of ~${Math.round(estimate.quota / 1024 / 1024)} MB available` : ''}` : 'Storage estimate unavailable in this browser.'}>
        <div className="flex items-center gap-2">
          {estimate?.persisted ? <Badge tone="emerald"><ShieldCheck /> Persistent</Badge> : <Badge tone="gold"><HardDrive /> Best-effort</Badge>}
          {!estimate?.persisted && <Button size="sm" variant="ghost" onClick={() => void requestPersistentStorage().then((ok) => { void storageEstimate().then(setEstimate); toast({ title: ok ? 'Storage marked persistent' : 'The browser declined persistence', description: ok ? undefined : 'Installing the app or using it often can help. Keep exporting backups.' }); })}>Request</Button>}
        </div>
      </Row>
      <Row label="Last backup" hint={age === null ? 'Never backed up.' : `${age === 0 ? 'Today' : `${age} days ago`}`}>
        <Button variant="primary" onClick={() => void downloadBackup().then((n) => toast({ title: 'Backup exported', description: n, tone: 'success' }))} data-testid="export-backup"><Download /> Export JSON backup</Button>
      </Row>
      <Row label="Restore from backup" hint="Validates every record, then replaces all local data in one transaction.">
        <>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} data-testid="import-file" />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload /> Import JSON</Button>
        </>
      </Row>
      <Row label="Export quests as CSV" hint="For spreadsheets. Not a full backup."><Button variant="secondary" onClick={() => void downloadQuestCsv()}><FileSpreadsheet /> Export CSV</Button></Row>
      <Row label="Backup reminder" hint="Remind me after this many days (0 disables).">
        <Input type="number" min={0} max={365} defaultValue={s.backupReminderDays} onBlur={(e) => void updateSettings({ backupReminderDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} className="w-24" />
      </Row>
      <Row label="Integrity check" hint={integrity ? `${integrity.orphanQuests} orphan quests · ${integrity.danglingDependencies} dangling dependencies · ${integrity.orphanSubtasks} orphan subtasks · ${integrity.orphanMilestones} orphan milestones` : 'Scan for broken references.'}>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => void checkIntegrity(false).then(setIntegrity)}>Scan</Button>
          {integrity && Object.values(integrity).some(Boolean) && <Button size="sm" variant="secondary" onClick={() => void checkIntegrity(true).then(() => checkIntegrity(false)).then(setIntegrity)}>Repair</Button>}
        </div>
      </Row>
      <Row label="Demo mode" hint={isDemoMode() ? 'You are in demo mode (separate database).' : 'Explore sample data in a separate database. Your real data is untouched.'}>
        <Button size="sm" variant="ghost" onClick={() => { setDemoMode(!isDemoMode()); location.reload(); }}><FileJson /> {isDemoMode() ? 'Exit demo' : 'Open demo'}</Button>
      </Row>
      <Row label={<span className="text-crimson">Erase all data</span>} hint="Permanently delete everything in this browser."><Button variant="danger" size="sm" onClick={() => setResetOpen(true)}><Trash2 /> Erase…</Button></Row>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} title="Restore this backup?" description={pending ? `Exported ${pending.backup.exportedAt.slice(0, 16).replace('T', ' ')} · schema v${pending.backup.schemaVersion}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button><Button variant="danger" onClick={() => void restoreBackup(pending!.backup).then(() => { setPending(null); toast({ title: 'Backup restored', tone: 'success' }); })} data-testid="confirm-restore">Replace all local data</Button></>}>
        {pending && (
          <div className="space-y-3 text-sm">
            <p className="text-fg-muted">This replaces <b className="text-fg">all</b> current data. Consider exporting a backup first.</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{TABLE_NAMES.filter((t) => pending.counts[t]).map((t) => <div key={t} className="flex justify-between rounded-lg border border-line px-2.5 py-1.5 text-xs"><span>{t}</span><span className="font-num">{pending.counts[t]}</span></div>)}</div>
            {pending.warnings.map((w) => <p key={w} className="text-xs text-gold">{w}</p>)}
          </div>
        )}
      </Dialog>
      <Dialog open={resetOpen} onOpenChange={setResetOpen} title="Erase all data" size="sm"
        footer={<><Button variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="danger" disabled={resetText !== 'ERASE'} onClick={() => void db.delete().then(() => { localStorage.removeItem('ascend:ui'); localStorage.removeItem('ascend:focus-timer'); location.reload(); })}>Erase everything</Button></>}>
        <p className="text-sm text-fg-muted">This cannot be undone. Type <b className="font-mono text-crimson">ERASE</b> to confirm.</p>
        <Input className="mt-3" value={resetText} onChange={(e) => setResetText(e.target.value)} aria-label="Type ERASE to confirm" />
      </Dialog>
    </Section>
  );
}

function AiSection({ settings: s }: { settings: Settings }) {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ text: string; p: number } | null>(null);
  const ai = s.ai;
  const set = (patch: Partial<Settings['ai']>) => { setStatus(null); void updateSettings({ ai: { ...ai, ...patch } }); };
  const test = async () => {
    const p = getProvider(ai);
    if (!p) return;
    setChecking(true);
    setStatus(await p.check());
    setChecking(false);
  };
  return (
    <Section id="ai" title="Optional local AI" description="Ascend is fully functional without AI — the planner is deterministic. Optionally connect a model that runs on your own hardware for milestone suggestions, description rewrites and review narratives. No API keys, no paid services.">
      <Row label="Provider">
        <Segmented ariaLabel="AI provider" value={ai.provider} onChange={(v) => set({ provider: v })} options={[{ value: 'none', label: 'None' }, { value: 'ollama', label: 'Ollama' }, { value: 'webllm', label: 'WebLLM' }]} />
      </Row>
      {ai.provider === 'ollama' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ollama URL" htmlFor="ai-url"><Input id="ai-url" defaultValue={ai.ollamaUrl} onBlur={(e) => set({ ollamaUrl: e.target.value.trim() || 'http://localhost:11434' })} /></Field>
            <Field label="Model" htmlFor="ai-model"><Input id="ai-model" defaultValue={ai.ollamaModel} onBlur={(e) => set({ ollamaModel: e.target.value.trim() || 'llama3.2' })} /></Field>
          </div>
          <div className="rounded-xl border border-line bg-bg-raised/60 p-3 text-xs leading-relaxed text-fg-muted">
            Run Ollama locally and allow this site’s origin, e.g. <code className="text-fg">OLLAMA_ORIGINS="{typeof location !== 'undefined' ? location.origin : ''}" ollama serve</code>, then <code className="text-fg">ollama pull {ai.ollamaModel}</code>. Never expose Ollama publicly. Some browsers restrict HTTPS pages from calling local services; if blocked, run Ascend locally.
          </div>
        </>
      )}
      {ai.provider === 'webllm' && (
        <>
          <Field label="WebLLM model" htmlFor="ai-wm" hint="Runs entirely in your browser via WebGPU. The first load downloads the model weights (hundreds of MB) from a public CDN and caches them."><Input id="ai-wm" defaultValue={ai.webllmModel} onBlur={(e) => set({ webllmModel: e.target.value.trim() || DEFAULT_SETTINGS.ai.webllmModel })} /></Field>
          {!webgpuSupported() ? <Badge tone="crimson">WebGPU is not supported on this device/browser</Badge> : (
            <Button variant="secondary" disabled={!!progress && progress.p < 1} onClick={() => void loadWebLLM(ai.webllmModel, (text, p) => setProgress({ text, p })).then(test).catch((e: unknown) => setStatus({ available: false, provider: 'webllm', reason: e instanceof Error ? e.message : String(e) }))}>
              {progress && progress.p < 1 ? <Loader2 className="animate-spin" /> : <Download />} Load model
            </Button>
          )}
          {progress && <div><ProgressBar value={progress.p} label="Model download" /><p className="mt-1 truncate text-xs text-fg-dim">{progress.text}</p></div>}
        </>
      )}
      {ai.provider !== 'none' && (
        <Row label="Connection status" hint={status ? (status.available ? `Connected: ${status.model}` : status.reason) : 'Not tested yet — AI features stay hidden until a test succeeds at the moment of use.'}>
          <div className="flex items-center gap-2">
            {status && (status.available ? <Badge tone="emerald"><Zap /> Available</Badge> : <Badge tone="crimson">Unavailable</Badge>)}
            <Button size="sm" variant="ghost" onClick={() => void test()} disabled={checking}>{checking ? <Loader2 className="animate-spin" /> : <RefreshCcw />} Test</Button>
          </div>
        </Row>
      )}
    </Section>
  );
}
