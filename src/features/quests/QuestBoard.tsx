import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, Columns3, GripVertical, KanbanSquare, List, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { DifficultyBadge, PriorityFlag, XpChip } from '@/components/game/badges';
import { QuestList } from '@/components/quest/QuestList';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, Input, PageHeader, Panel, Segmented, Select } from '@/components/ui/primitives';
import {
  CATEGORIES, CATEGORY_LABEL, DIFFICULTIES, DIFFICULTY_LABEL, PRIORITIES, PRIORITY_LABEL, PRIORITY_WEIGHT, STATUSES, STATUS_LABEL,
  type Quest, type QuestStatus,
} from '@/domain/types';
import { questXp } from '@/domain/xp';
import { useQuestContext, useToday } from '@/hooks/data';
import { useQuestActions } from '@/hooks/useQuestActions';
import { relativeDayLabel } from '@/lib/dates';
import { cn, formatMinutes } from '@/lib/utils';
import { archiveQuests, bulkUpdateQuests, deleteQuests, reorderQuests } from '@/services/quests';
import { useUI } from '@/store/ui';

interface Filters {
  search: string;
  campaign: string;
  category: string;
  difficulty: string;
  priority: string;
  status: string;
  tag: string;
}
const EMPTY: Filters = { search: '', campaign: 'all', category: 'all', difficulty: 'all', priority: 'all', status: 'open', tag: '' };
type Sort = 'manual' | 'priority' | 'due' | 'created' | 'estimate' | 'title';

const COLUMNS: { id: QuestStatus; title: string; tone: string }[] = [
  { id: 'todo', title: 'To do', tone: 'var(--fg-dim)' },
  { id: 'in_progress', title: 'In progress', tone: 'var(--c-cyan)' },
  { id: 'done', title: 'Completed', tone: 'var(--c-emerald)' },
];

export default function QuestBoard() {
  const ctx = useQuestContext();
  const today = useToday();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [f, setF] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<Sort>('manual');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const openEditor = useUI((s) => s.openEditor);

  const tags = useMemo(() => [...new Set((ctx?.quests ?? []).flatMap((q) => q.tags))].sort(), [ctx?.quests]);
  const filtered = useMemo(() => {
    if (!ctx) return [];
    const s = f.search.toLowerCase().trim();
    const list = ctx.quests.filter((q) => {
      if (q.archivedAt) return false;
      if (s && !q.title.toLowerCase().includes(s) && !q.description.toLowerCase().includes(s) && !q.tags.some((t) => t.includes(s))) return false;
      if (f.campaign !== 'all' && (f.campaign === 'none' ? q.campaignId : q.campaignId !== f.campaign)) return false;
      if (f.category !== 'all' && q.category !== f.category) return false;
      if (f.difficulty !== 'all' && q.difficulty !== f.difficulty) return false;
      if (f.priority !== 'all' && q.priority !== f.priority) return false;
      if (f.status === 'open' && (q.status === 'done' || q.status === 'skipped') && view === 'list') return false;
      if (f.status !== 'all' && f.status !== 'open' && q.status !== f.status) return false;
      if (f.tag && !q.tags.includes(f.tag)) return false;
      return true;
    });
    const cmp: Record<Sort, (a: Quest, b: Quest) => number> = {
      manual: (a, b) => a.order - b.order,
      priority: (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority],
      due: (a, b) => (a.dueDate ?? a.scheduledDate ?? '9999').localeCompare(b.dueDate ?? b.scheduledDate ?? '9999'),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      estimate: (a, b) => a.estimatedMinutes - b.estimatedMinutes,
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return list.sort(cmp[sort]);
  }, [ctx, f, sort, view]);

  if (!ctx) return null;
  const activeFilters = Object.entries(f).filter(([k, v]) => v !== EMPTY[k as keyof Filters]).length;
  const toggle = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  return (
    <div>
      <PageHeader
        eyebrow="All quests"
        title="Quest Board"
        description="Drag quests between columns, filter and search, or switch to list view for bulk editing."
        actions={
          <>
            <Segmented ariaLabel="View" value={view} onChange={(v) => { setView(v); setSelected(new Set()); }} options={[{ value: 'board', label: <span className="flex items-center gap-1.5"><Columns3 /> Board</span> }, { value: 'list', label: <span className="flex items-center gap-1.5"><List /> List</span> }]} />
            <Button variant="primary" onClick={() => openEditor()}><Plus /> New quest</Button>
          </>
        }
      />
      <Panel className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-dim" />
            <Input value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} placeholder="Search title, description or tag…" className="h-9 pl-9" aria-label="Search quests" />
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 w-40" aria-label="Sort by">
            <option value="manual">Manual order</option>
            <option value="priority">Priority</option>
            <option value="due">Due / scheduled</option>
            <option value="created">Newest</option>
            <option value="estimate">Shortest first</option>
            <option value="title">Title</option>
          </Select>
          <Button variant={showFilters ? 'outline' : 'secondary'} size="sm" className="h-9" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal /> Filters {activeFilters > 0 && <Badge tone="accent" className="h-5">{activeFilters}</Badge>}
          </Button>
          {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={() => setF(EMPTY)}><X /> Clear</Button>}
        </div>
        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
            <Select value={f.campaign} onChange={(e) => setF({ ...f, campaign: e.target.value })} aria-label="Campaign">
              <option value="all">All campaigns</option>
              <option value="none">No campaign</option>
              {ctx.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
            <Select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })} aria-label="Difficulty">
              <option value="all">All difficulties</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
            </Select>
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} aria-label="Priority">
              <option value="all">All priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Status">
              <option value="open">Open (list) / all (board)</option>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
            <Select value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} aria-label="Tag">
              <option value="">All tags</option>
              {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </Select>
          </motion.div>
        )}
      </Panel>

      {view === 'board' ? <Board quests={filtered} manual={sort === 'manual'} /> : (
        <>
          {selected.size > 0 && <BulkBar ids={[...selected]} clear={() => setSelected(new Set())} />}
          <Panel className="p-2">
            <div className="flex items-center gap-3 border-b border-line px-3 py-2 text-xs text-fg-muted">
              <button className="font-semibold hover:text-fg" onClick={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((q) => q.id)))}>
                {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : `Select all (${filtered.length})`}
              </button>
            </div>
            <QuestList quests={filtered} today={today} selectable selected={selected} onSelect={toggle} empty={<EmptyState icon={<KanbanSquare />} title="No quests match" description="Adjust filters or create a new quest." />} />
          </Panel>
        </>
      )}
    </div>
  );
}

function BulkBar({ ids, clear }: { ids: string[]; clear: () => void }) {
  const ctx = useQuestContext();
  const toast = useUI((s) => s.toast);
  const apply = async (patch: Partial<Quest>, label: string) => {
    await bulkUpdateQuests(ids, patch);
    toast({ title: `Updated ${ids.length} quests`, description: label, tone: 'success' });
  };
  if (!ctx) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="panel sticky top-20 z-20 mb-3 flex flex-wrap items-center gap-2 bg-surface-2! p-3" role="toolbar" aria-label="Bulk edit">
      <Badge tone="accent" className="h-8 px-3 text-sm">{ids.length} selected</Badge>
      <Select className="h-8 w-36" value="" onChange={(e) => e.target.value && void apply({ status: e.target.value as QuestStatus }, STATUS_LABEL[e.target.value as QuestStatus])} aria-label="Set status">
        <option value="">Status…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </Select>
      <Select className="h-8 w-36" value="" onChange={(e) => e.target.value && void apply({ priority: e.target.value as Quest['priority'] }, 'Priority')} aria-label="Set priority">
        <option value="">Priority…</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
      </Select>
      <Select className="h-8 w-36" value="" onChange={(e) => e.target.value && void apply({ difficulty: e.target.value as Quest['difficulty'] }, 'Difficulty')} aria-label="Set difficulty">
        <option value="">Difficulty…</option>
        {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
      </Select>
      <Select className="h-8 w-44" value="" onChange={(e) => e.target.value && void apply({ campaignId: e.target.value === 'none' ? undefined : e.target.value, questlineId: undefined, milestoneId: undefined }, 'Campaign')} aria-label="Set campaign">
        <option value="">Campaign…</option>
        <option value="none">No campaign</option>
        {ctx.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Input type="date" className="h-8 w-40" aria-label="Schedule date" onChange={(e) => e.target.value && void apply({ scheduledDate: e.target.value }, `Scheduled ${e.target.value}`)} />
      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => void archiveQuests(ids).then(clear)}><Archive /> Archive</Button>
        <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${ids.length} quests permanently?`) && void deleteQuests(ids).then(clear)}><Trash2 /> Delete</Button>
        <Button size="sm" variant="ghost" onClick={clear} aria-label="Clear selection"><X /></Button>
      </div>
    </motion.div>
  );
}

function Board({ quests, manual }: { quests: Quest[]; manual: boolean }) {
  const { setStatus } = useQuestActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const columns = useMemo(() => {
    const m: Record<string, Quest[]> = { todo: [], in_progress: [], done: [] };
    for (const q of quests) if (m[q.status]) m[q.status].push(q);
    m.done = m.done.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 40);
    return m;
  }, [quests]);
  const findCol = (id: string) => (id in columns ? id : Object.keys(columns).find((k) => columns[k].some((q) => q.id === id)));
  const active = activeId ? quests.find((q) => q.id === activeId) : undefined;

  const onEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const from = findCol(String(e.active.id));
    const to = e.over ? findCol(String(e.over.id)) : undefined;
    if (!from || !to) return;
    if (from !== to) {
      await setStatus(String(e.active.id), to as QuestStatus);
      return;
    }
    if (!manual || !e.over || e.active.id === e.over.id) return;
    const ids = columns[from].map((q) => q.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    await reorderQuests(next);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={(e) => void onEnd(e)} onDragCancel={() => setActiveId(null)}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => <Column key={c.id} col={c} quests={columns[c.id]} />)}
      </div>
      <DragOverlay dropAnimation={{ duration: 200 }}>{active ? <Card quest={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ col, quests }: { col: (typeof COLUMNS)[number]; quests: Quest[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const minutes = quests.reduce((s, q) => s + q.estimatedMinutes, 0);
  return (
    <section ref={setNodeRef} aria-label={col.title} className={cn('panel flex min-h-[420px] flex-col p-3 transition-colors', isOver && 'border-[color-mix(in_oklab,var(--accent)_45%,transparent)]! bg-surface-2!')}>
      <header className="mb-3 flex items-center gap-2 px-1">
        <span className="size-2 rotate-45 rounded-[2px]" style={{ background: col.tone }} />
        <h2 className="font-display text-sm font-semibold tracking-wide">{col.title}</h2>
        <Badge className="h-5">{quests.length}</Badge>
        <span className="ml-auto font-num text-xs text-fg-dim">{formatMinutes(minutes)}</span>
      </header>
      <SortableContext items={quests.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {quests.map((q) => <SortableCard key={q.id} quest={q} />)}
          {quests.length === 0 && <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-line py-10 text-xs text-fg-dim">Drop quests here</div>}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableCard({ quest }: { quest: Quest }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: quest.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <Card quest={quest} handle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function Card({ quest: q, handle, overlay }: { quest: Quest; handle?: Record<string, unknown>; overlay?: boolean }) {
  const ctx = useQuestContext();
  const today = useToday();
  const openEditor = useUI((s) => s.openEditor);
  if (!ctx) return null;
  const subs = ctx.subtaskCounts.get(q.id);
  return (
    <div className={cn('group rounded-[12px] border border-line bg-surface-2 p-3 transition-shadow hover:border-line-strong', overlay && 'rotate-[1.5deg] shadow-2xl ring-1 ring-accent')}>
      <div className="flex items-start gap-2">
        <button {...handle} className="mt-0.5 cursor-grab touch-none text-fg-dim hover:text-fg active:cursor-grabbing" aria-label={`Drag ${q.title}`}>
          <GripVertical className="size-4" />
        </button>
        <button onClick={() => openEditor(q.id)} className="min-w-0 flex-1 text-left">
          <div className={cn('text-sm font-semibold', q.status === 'done' && 'text-fg-dim line-through')}>{q.title}</div>
          {q.campaignId && <div className="mt-0.5 truncate text-[0.7rem] text-fg-dim">{ctx.campaignName.get(q.campaignId)}</div>}
        </button>
        <PriorityFlag priority={q.priority} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
        <DifficultyBadge difficulty={q.difficulty} />
        <XpChip xp={questXp(q, ctx.settings)} />
        <span className="font-num text-[0.7rem] text-fg-dim">{formatMinutes(q.estimatedMinutes)}</span>
        {(q.dueDate ?? q.scheduledDate) && <span className="text-[0.7rem] text-fg-muted">{relativeDayLabel((q.dueDate ?? q.scheduledDate)!, today)}</span>}
        {subs && <span className="font-num text-[0.7rem] text-fg-dim">☐ {subs.done}/{subs.total}</span>}
      </div>
    </div>
  );
}
