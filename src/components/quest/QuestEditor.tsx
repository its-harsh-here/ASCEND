import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ExternalLink, Link2, Lock, Plus, Sparkles, Trash2, Unlock, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/dialog';
import { Badge, Checkbox, Field, Input, Label, Select, Switch, Textarea } from '@/components/ui/primitives';
import { getProvider, improveDescription } from '@/ai/providers';
import { db } from '@/db/schema';
import { SKILLS } from '@/domain/skills';
import {
  CATEGORIES, CATEGORY_LABEL, DIFFICULTIES, DIFFICULTY_LABEL, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL,
  type Quest, type QuestLink,
} from '@/domain/types';
import { questXp } from '@/domain/xp';
import { useQuestContext, useToday } from '@/hooks/data';
import { useQuestActions } from '@/hooks/useQuestActions';
import { describeRecurrence } from '@/domain/recurrence';
import { WEEKDAY_SHORT } from '@/lib/dates';
import { cn, safeUrl, orEmpty } from '@/lib/utils';
import { createRecurrence } from '@/services/recurring';
import { addSubtask, archiveQuests, createQuest, deleteQuests, deleteSubtask, updateQuest, updateSubtask } from '@/services/quests';
import { useUI } from '@/store/ui';

type Form = Omit<Quest, 'id' | 'createdAt' | 'updatedAt'>;

function blank(defaults?: Partial<Quest>): Form {
  return {
    title: '', description: '', category: 'main', difficulty: 'medium', priority: 'medium', status: 'todo',
    estimatedMinutes: 60, actualMinutes: 0, deadlineLocked: false, dependencies: [], notes: '', tags: [], links: [],
    skillIds: [], optional: false, origin: 'manual', userEdited: false, order: Date.now(), ...defaults,
  } as Form;
}

/** True if `candidate` (transitively) depends on `questId` — adding it as a dependency would create a cycle. */
function createsCycle(questId: string | undefined, candidate: string, byId: Map<string, Quest>): boolean {
  if (!questId) return false;
  const stack = [candidate];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === questId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(byId.get(id)?.dependencies ?? []));
  }
  return false;
}

export function QuestEditorDialog() {
  const editor = useUI((s) => s.editor);
  const close = useUI((s) => s.closeEditor);
  const toast = useUI((s) => s.toast);
  const ctx = useQuestContext();
  const today = useToday();
  const { setStatus } = useQuestActions();
  const existing = editor.questId ? ctx?.byId.get(editor.questId) : undefined;
  const isNew = !editor.questId;
  const [form, setForm] = useState<Form>(() => blank(editor.defaults));
  const [tagText, setTagText] = useState('');
  const [repeat, setRepeat] = useState<{ on: boolean; frequency: 'daily' | 'weekdays' | 'weekly'; weekdays: number[] }>({ on: false, frequency: 'daily', weekdays: [1] });
  const [newSubtask, setNewSubtask] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingSubtasks, setPendingSubtasks] = useState<string[]>([]);

  const subtasks = orEmpty(useLiveQuery(() => (editor.questId ? db.subtasks.where('questId').equals(editor.questId).sortBy('order') : []), [editor.questId]));
  const questlines = orEmpty(useLiveQuery(() => (form.campaignId ? db.questlines.where('campaignId').equals(form.campaignId).sortBy('order') : []), [form.campaignId]));
  const milestones = orEmpty(useLiveQuery(() => (form.questlineId ? db.milestones.where('questlineId').equals(form.questlineId).sortBy('order') : []), [form.questlineId]));

  useEffect(() => {
    if (!editor.open) return;
    if (existing) {
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = existing;
      setForm(rest);
      setTagText(rest.tags.join(', '));
    } else {
      const f = blank({ ...editor.defaults, campaignId: editor.defaults?.campaignId ?? ctx?.settings.defaultCampaignId });
      setForm(f);
      setTagText(f.tags.join(', '));
      setRepeat({ on: f.category === 'daily' || f.category === 'weekly', frequency: f.category === 'weekly' ? 'weekly' : 'daily', weekdays: [1] });
      setPendingSubtasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.open, editor.questId]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const depCandidates = useMemo(() => {
    if (!ctx) return [];
    return ctx.quests
      .filter((q) => q.id !== editor.questId && !form.dependencies.includes(q.id) && !q.archivedAt && q.origin !== 'recurring')
      .sort((a, b) => Number(b.campaignId === form.campaignId) - Number(a.campaignId === form.campaignId) || a.title.localeCompare(b.title));
  }, [ctx, editor.questId, form.dependencies, form.campaignId]);

  if (!ctx) return null;
  const xp = questXp(form, ctx.settings);

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: 'A quest needs a title', tone: 'error' });
      return;
    }
    const tags = tagText.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
    const payload = { ...form, tags, title: form.title.trim() };
    try {
      if (isNew && repeat.on && (form.category === 'daily' || form.category === 'weekly')) {
        await createRecurrence({
          title: payload.title, description: payload.description, category: form.category, difficulty: payload.difficulty,
          priority: payload.priority, estimatedMinutes: payload.estimatedMinutes, frequency: repeat.frequency, interval: 1,
          weekdays: repeat.frequency === 'daily' ? [] : repeat.weekdays, startDate: payload.scheduledDate ?? today,
          campaignId: payload.campaignId, tags, skillIds: payload.skillIds, active: true,
        });
        toast({ title: 'Recurring quest created', description: describeRecurrence({ ...repeat, interval: 1 }), tone: 'success' });
      } else if (isNew) {
        const q = await createQuest(payload);
        for (const t of pendingSubtasks) await addSubtask(q.id, t);
        toast({ title: 'Quest created', description: payload.title, tone: 'success' });
      } else {
        const { status, ...rest } = payload;
        await updateQuest(editor.questId!, rest);
        if (existing && status !== existing.status) await setStatus(editor.questId!, status);
        toast({ title: 'Quest saved', tone: 'success' });
      }
      close();
    } catch (e) {
      toast({ title: 'Could not save quest', description: e instanceof Error ? e.message : String(e), tone: 'error' });
    }
  };

  const remove = async () => {
    if (!editor.questId || !confirm('Delete this quest permanently? Earned XP is kept.')) return;
    await deleteQuests([editor.questId]);
    close();
    toast({ title: 'Quest deleted' });
  };

  const aiImprove = async () => {
    const provider = getProvider(ctx.settings.ai);
    if (!provider) return;
    setAiBusy(true);
    try {
      const status = await provider.check();
      if (!status.available) throw new Error(status.reason ?? 'AI is not available.');
      const text = await improveDescription(provider, form.title, form.description);
      set('description', text);
      toast({ title: 'Description rewritten by local AI', description: `${provider.label} — review before saving.`, tone: 'gold' });
    } catch (e) {
      toast({ title: 'Local AI unavailable', description: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setAiBusy(false);
    }
  };

  const linkRows = form.links;
  const setLink = (i: number, patch: Partial<QuestLink>) => set('links', linkRows.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Dialog
      open={editor.open}
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={isNew ? 'New quest' : 'Edit quest'}
      description={isNew ? 'Define the objective, its reward and when it should happen.' : existing?.origin === 'generated' ? 'Generated by the planner — your edits are preserved during regeneration.' : undefined}
      footer={
        <>
          {!isNew && (
            <div className="mr-auto flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => void archiveQuests([editor.questId!]).then(close)}>
                <Archive /> Archive
              </Button>
              <Button variant="ghost" size="sm" className="text-crimson" onClick={() => void remove()}>
                <Trash2 /> Delete
              </Button>
            </div>
          )}
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} data-testid="save-quest">
            {isNew ? 'Create quest' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <Field label="Title" htmlFor="q-title">
            <Input id="q-title" autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Write a multi-stage Dockerfile" maxLength={300} />
          </Field>
          <Field
            label={
              <span className="flex items-center justify-between">
                Description
                {ctx.settings.ai.provider !== 'none' && (
                  <button type="button" onClick={() => void aiImprove()} disabled={aiBusy} className="inline-flex items-center gap-1 text-[0.72rem] font-semibold text-gold hover:underline disabled:opacity-50">
                    <Sparkles className="size-3" /> {aiBusy ? 'Thinking…' : 'Improve with local AI'}
                  </button>
                )}
              </span>
            }
            htmlFor="q-desc"
          >
            <Textarea id="q-desc" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What does done look like?" />
          </Field>
          {form.deliverable !== undefined && (
            <Field label="Deliverable" htmlFor="q-deliv">
              <Input id="q-deliv" value={form.deliverable ?? ''} onChange={(e) => set('deliverable', e.target.value)} />
            </Field>
          )}

          <div>
            <Label>Subtasks</Label>
            <div className="space-y-1">
              {(isNew ? pendingSubtasks.map((t, i) => ({ id: String(i), title: t, done: false })) : subtasks).map((s) => (
                <div key={s.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <Checkbox tone="emerald" checked={s.done} disabled={isNew} onCheckedChange={(v) => void updateSubtask(s.id, { done: v === true })} aria-label={`Toggle ${s.title}`} />
                  <span className={cn('flex-1 text-sm', s.done && 'text-fg-dim line-through')}>{s.title}</span>
                  <button
                    className="text-fg-dim opacity-0 group-hover:opacity-100 hover:text-crimson"
                    onClick={() => (isNew ? setPendingSubtasks((p) => p.filter((_, i) => String(i) !== s.id)) : void deleteSubtask(s.id))}
                    aria-label={`Remove ${s.title}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSubtask.trim()) return;
                  if (isNew) setPendingSubtasks((p) => [...p, newSubtask.trim()]);
                  else void addSubtask(editor.questId!, newSubtask);
                  setNewSubtask('');
                }}
              >
                <Input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} placeholder="Add a subtask and press Enter" className="h-9" aria-label="New subtask" />
                <Button type="submit" size="icon" aria-label="Add subtask"><Plus /></Button>
              </form>
            </div>
          </div>

          <div>
            <Label>Prerequisites</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {form.dependencies.map((d) => (
                <Badge key={d} tone={ctx.byId.get(d)?.status === 'done' ? 'emerald' : 'neutral'} className="h-7 pr-1">
                  <Link2 /> {ctx.byId.get(d)?.title ?? 'Missing quest'}
                  <button onClick={() => set('dependencies', form.dependencies.filter((x) => x !== d))} aria-label="Remove prerequisite" className="ml-1 rounded p-0.5 hover:bg-surface-3"><X /></button>
                </Badge>
              ))}
              <DependencyPicker
                candidates={depCandidates}
                onPick={(id) => {
                  if (createsCycle(editor.questId, id, ctx.byId)) {
                    toast({ title: 'That would create a dependency cycle', tone: 'error' });
                    return;
                  }
                  set('dependencies', [...form.dependencies, id]);
                }}
              />
            </div>
          </div>

          <div>
            <Label>Links</Label>
            <div className="space-y-2">
              {linkRows.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} placeholder="Label" className="h-9 w-1/3" />
                  <Input value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://…" className={cn('h-9', l.url && !safeUrl(l.url) && 'border-crimson')} />
                  {safeUrl(l.url) && (
                    <a href={safeUrl(l.url)!} target="_blank" rel="noopener noreferrer" className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface-2" aria-label="Open link"><ExternalLink className="size-4" /></a>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => set('links', linkRows.filter((_, j) => j !== i))} aria-label="Remove link"><X /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => set('links', [...linkRows, { label: '', url: '' }])}><Plus /> Add link</Button>
            </div>
          </div>

          <Field label="Notes" htmlFor="q-notes">
            <Textarea id="q-notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Private notes, learnings, blockers…" className="min-h-[70px]" />
          </Field>
        </div>

        <aside className="space-y-3.5">
          <div className="flex items-center justify-between rounded-[12px] border border-line bg-surface-2 px-3 py-2.5">
            <span className="text-xs font-semibold text-fg-muted">Reward</span>
            <span className="font-num text-sm font-semibold text-gold">{xp} XP</span>
          </div>
          {!isNew && (
            <Field label="Status" htmlFor="q-status">
              <Select id="q-status" value={form.status} onChange={(e) => set('status', e.target.value as Quest['status'])}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Category" htmlFor="q-cat">
            <Select id="q-cat" value={form.category} onChange={(e) => set('category', e.target.value as Quest['category'])}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          {isNew && (form.category === 'daily' || form.category === 'weekly') && (
            <div className="rounded-[12px] border border-line bg-surface-2 p-3">
              <label className="flex items-center justify-between text-xs font-semibold text-fg-muted">
                Repeat automatically
                <Switch checked={repeat.on} onCheckedChange={(v) => setRepeat((r) => ({ ...r, on: v }))} />
              </label>
              {repeat.on && (
                <div className="mt-2.5 space-y-2">
                  <Select value={repeat.frequency} onChange={(e) => setRepeat((r) => ({ ...r, frequency: e.target.value as typeof r.frequency }))} aria-label="Frequency">
                    <option value="daily">Every day</option>
                    <option value="weekdays">On specific days</option>
                    <option value="weekly">Once a week</option>
                  </Select>
                  {repeat.frequency !== 'daily' && (
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAY_SHORT.map((d, i) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={repeat.weekdays.includes(i)}
                          onClick={() => setRepeat((r) => ({ ...r, weekdays: r.frequency === 'weekly' ? [i] : r.weekdays.includes(i) ? r.weekdays.filter((x) => x !== i) : [...r.weekdays, i] }))}
                          className={cn('h-7 w-9 rounded-md border text-[0.7rem] font-semibold', repeat.weekdays.includes(i) ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-accent' : 'border-line text-fg-muted')}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Difficulty" htmlFor="q-diff">
              <Select id="q-diff" value={form.difficulty} onChange={(e) => set('difficulty', e.target.value as Quest['difficulty'])}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="q-prio">
              <Select id="q-prio" value={form.priority} onChange={(e) => set('priority', e.target.value as Quest['priority'])}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </Field>
            <Field label="Estimate (min)" htmlFor="q-est">
              <Input id="q-est" type="number" min={0} step={5} value={form.estimatedMinutes} onChange={(e) => set('estimatedMinutes', Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Actual (min)" htmlFor="q-act">
              <Input id="q-act" type="number" min={0} step={5} value={form.actualMinutes} onChange={(e) => set('actualMinutes', Math.max(0, Number(e.target.value) || 0))} />
            </Field>
          </div>
          <Field label="XP override" htmlFor="q-xp" hint="Leave empty to use the difficulty default.">
            <Input id="q-xp" type="number" min={0} value={form.xpReward ?? ''} onChange={(e) => set('xpReward', e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value))))} />
          </Field>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label="Scheduled" htmlFor="q-sched">
              <Input id="q-sched" type="date" value={form.scheduledDate ?? ''} onChange={(e) => set('scheduledDate', e.target.value || undefined)} />
            </Field>
            <Field label="Time" htmlFor="q-time">
              <Input id="q-time" type="time" value={form.scheduledTime ?? ''} onChange={(e) => set('scheduledTime', e.target.value || undefined)} />
            </Field>
          </div>
          <Field label={<span className="flex items-center justify-between">Deadline
            <button type="button" onClick={() => set('deadlineLocked', !form.deadlineLocked)} className={cn('inline-flex items-center gap-1 text-[0.7rem]', form.deadlineLocked ? 'text-gold' : 'text-fg-dim')} aria-pressed={form.deadlineLocked}>
              {form.deadlineLocked ? <Lock className="size-3" /> : <Unlock className="size-3" />}{form.deadlineLocked ? 'Locked' : 'Lock'}
            </button></span>} htmlFor="q-due">
            <Input id="q-due" type="date" value={form.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || undefined)} />
          </Field>
          <Field label="Campaign" htmlFor="q-camp">
            <Select id="q-camp" value={form.campaignId ?? ''} onChange={(e) => setForm((f) => ({ ...f, campaignId: e.target.value || undefined, questlineId: undefined, milestoneId: undefined }))}>
              <option value="">No campaign</option>
              {ctx.campaigns.filter((c) => c.status !== 'archived').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          {questlines.length > 0 && (
            <Field label="Questline" htmlFor="q-line">
              <Select id="q-line" value={form.questlineId ?? ''} onChange={(e) => setForm((f) => ({ ...f, questlineId: e.target.value || undefined, milestoneId: undefined }))}>
                <option value="">None</option>
                {questlines.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </Select>
            </Field>
          )}
          {milestones.length > 0 && (
            <Field label="Milestone" htmlFor="q-ms">
              <Select id="q-ms" value={form.milestoneId ?? ''} onChange={(e) => set('milestoneId', e.target.value || undefined)}>
                <option value="">None</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Tags" htmlFor="q-tags" hint="Comma separated. Tags like docker or dsa also feed the skill tree.">
            <Input id="q-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="cloud, docker" />
          </Field>
          <Field label="Skills" htmlFor="q-skill">
            <Select id="q-skill" value="" onChange={(e) => e.target.value && !form.skillIds.includes(e.target.value) && set('skillIds', [...form.skillIds, e.target.value])}>
              <option value="">Add a skill…</option>
              {SKILLS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {form.skillIds.map((id) => (
                <Badge key={id} tone="accent" className="pr-1">
                  {SKILLS.find((s) => s.id === id)?.name ?? id}
                  <button onClick={() => set('skillIds', form.skillIds.filter((x) => x !== id))} aria-label="Remove skill"><X /></button>
                </Badge>
              ))}
            </div>
          </Field>
          <label className="flex items-center justify-between text-xs font-semibold text-fg-muted">
            Optional quest
            <Switch checked={form.optional} onCheckedChange={(v) => set('optional', v)} />
          </label>
        </aside>
      </div>
    </Dialog>
  );
}

function DependencyPicker({ candidates, onPick }: { candidates: Quest[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = candidates.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost"><Plus /> Add prerequisite</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quests…" className="mb-2 h-8" />
        <div className="max-h-64 overflow-y-auto">
          {list.length === 0 && <p className="p-3 text-center text-xs text-fg-dim">No matching quests</p>}
          {list.map((c) => (
            <button key={c.id} onClick={() => { onPick(c.id); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-3">
              <span className={cn('size-1.5 shrink-0 rotate-45', c.status === 'done' ? 'bg-emerald' : 'bg-fg-dim')} />
              <span className="truncate">{c.title}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
