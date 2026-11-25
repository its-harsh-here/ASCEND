import { Background, Controls, Handle, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CheckCircle2, Lock, Plus, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge, PageHeader, Panel, ProgressBar, ProgressRing } from '@/components/ui/primitives';
import { SKILL_BRANCHES, SKILL_BY_ID, SKILL_RANKS, SKILLS, computeSkillProgress, type SkillProgress } from '@/domain/skills';
import { useQuests, useSettings, useXpEvents } from '@/hooks/data';
import { cn, formatNumber, orEmpty } from '@/lib/utils';
import { useUI } from '@/store/ui';

type SkillNodeData = { progress: SkillProgress; color: string; fresh: boolean; selected: boolean };
type SkillNode = Node<SkillNodeData, 'skill'>;

const SEEN_KEY = 'ascend:skills-unlocked-seen';

function SkillNodeView({ data }: NodeProps<SkillNode>) {
  const { progress: p, color, fresh, selected } = data;
  const locked = !p.unlocked;
  return (
    <motion.div
      initial={fresh ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 14 }}
      className={cn('relative w-[190px] rounded-[14px] border bg-surface p-3 transition-shadow', locked ? 'border-line opacity-55' : 'border-line-strong', selected && 'ring-2 ring-accent')}
      style={!locked && p.rank > 0 ? { boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 45%, transparent), 0 0 28px -8px ${color}` } : undefined}
      data-testid={`skill-node-${p.skill.id}`}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-0 !bg-line-strong" />
      {fresh && <motion.span className="pointer-events-none absolute inset-0 rounded-[14px] border-2" style={{ borderColor: color }} initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 0, scale: 1.25 }} transition={{ duration: 1.4, repeat: 2 }} />}
      <div className="flex items-center gap-2.5">
        <ProgressRing value={p.nextRankXp ? p.progressToNext : 1} size={42} stroke={3.5} tone={locked ? 'var(--fg-dim)' : color}>
          {locked ? <Lock className="size-4 text-fg-dim" /> : <Icon name={p.skill.icon} className="size-4" style={{ color }} />}
        </ProgressRing>
        <div className="min-w-0">
          <div className="truncate text-[0.8rem] font-semibold">{p.skill.name}</div>
          <div className="text-[0.66rem] text-fg-dim">{locked ? 'Locked' : `${p.rankName} · rank ${p.rank}`}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-[3px]" aria-label={`Rank ${p.rank} of 5`}>
        {[1, 2, 3, 4, 5].map((r) => <span key={r} className="h-1 flex-1 rounded-full" style={{ background: r <= p.rank ? color : 'var(--surface-3)' }} />)}
      </div>
      <div className="mt-1.5 font-num text-[0.66rem] text-fg-muted">{formatNumber(p.xp)} XP{p.nextRankXp ? ` / ${formatNumber(p.nextRankXp)}` : ' · max'}</div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-0 !bg-line-strong" />
    </motion.div>
  );
}

const nodeTypes = { skill: SkillNodeView };

export default function SkillTreePage() {
  const events = useXpEvents();
  const quests = orEmpty(useQuests());
  const settings = useSettings();
  const openEditor = useUI((s) => s.openEditor);
  const [selected, setSelected] = useState<string | null>(null);
  const progress = useMemo(() => computeSkillProgress(events ?? []), [events]);
  const [seen, setSeen] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
  });
  const unlockedNow = useMemo(() => [...progress.values()].filter((p) => p.rank > 0).map((p) => p.skill.id), [progress]);
  const fresh = useMemo(() => new Set(events ? unlockedNow.filter((id) => !seen.has(id)) : []), [unlockedNow, seen, events]);
  useEffect(() => {
    if (!events || fresh.size === 0) return;
    const t = setTimeout(() => {
      const next = new Set([...seen, ...fresh]);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
      setSeen(next);
    }, 4500);
    return () => clearTimeout(t);
  }, [fresh, seen, events]);

  const { nodes, edges } = useMemo(() => {
    const depth = new Map<string, number>();
    const d = (id: string): number => {
      if (depth.has(id)) return depth.get(id)!;
      const s = SKILL_BY_ID.get(id)!;
      const v = s.prerequisites.length ? 1 + Math.max(...s.prerequisites.map(d)) : 0;
      depth.set(id, v);
      return v;
    };
    SKILLS.forEach((s) => d(s.id));
    const nodes: SkillNode[] = [];
    // Two rows of four branches keep the tree close to the viewport's aspect ratio.
    const ROW_H = (Math.max(...depth.values()) + 1) * 150 + 160;
    let x = 0;
    for (const [bi, b] of SKILL_BRANCHES.entries()) {
      if (bi % 4 === 0) x = 0;
      const yOff = Math.floor(bi / 4) * ROW_H;
      const inBranch = SKILLS.filter((s) => s.branch === b.id);
      const byDepth = new Map<number, string[]>();
      for (const s of inBranch) (byDepth.get(depth.get(s.id)!) ?? byDepth.set(depth.get(s.id)!, []).get(depth.get(s.id)!)!).push(s.id);
      const cols = Math.max(...[...byDepth.values()].map((v) => v.length));
      for (const [dep, ids] of byDepth) {
        ids.forEach((id, i) => {
          const p = progress.get(id)!;
          nodes.push({
            id,
            type: 'skill',
            position: { x: x + i * 215 + ((cols - ids.length) * 215) / 2, y: yOff + 90 + dep * 150 },
            data: { progress: p, color: b.color, fresh: fresh.has(id), selected: selected === id },
            draggable: false,
          });
        });
      }
      nodes.push({ id: `branch-${b.id}`, type: 'default', position: { x: x + ((cols - 1) * 215) / 2, y: yOff }, data: { label: b.name } as never, draggable: false, selectable: false, className: 'branch-label' } as unknown as SkillNode);
      x += cols * 215 + 90;
    }
    const edges: Edge[] = SKILLS.flatMap((s) =>
      s.prerequisites.map((pre) => {
        const active = (progress.get(pre)?.rank ?? 0) >= 1;
        const color = SKILL_BRANCHES.find((b) => b.id === s.branch)!.color;
        return { id: `${pre}-${s.id}`, source: pre, target: s.id, animated: active && (progress.get(s.id)?.unlocked ?? false), style: { stroke: active ? color : 'var(--line-strong)', strokeWidth: active ? 2 : 1.2, opacity: active ? 0.9 : 0.6 } };
      }),
    );
    return { nodes, edges };
  }, [progress, fresh, selected]);

  const sel = selected ? progress.get(selected) : undefined;
  const related = sel ? quests.filter((q) => q.skillIds.includes(sel.skill.id) && !q.archivedAt) : [];
  const unlockedCount = [...progress.values()].filter((p) => p.unlocked).length;
  const totalSkillXp = [...progress.values()].reduce((s, p) => s + p.xp, 0);

  return (
    <div>
      <PageHeader eyebrow="Mastery" title="Skill Tree" description="Skills grow only from XP of quests you actually complete. Nodes unlock once their prerequisites reach rank 1." actions={<div className="flex gap-2"><Badge tone="accent" className="h-8 px-3">{unlockedCount}/{SKILLS.length} unlocked</Badge><Badge tone="gold" className="h-8 px-3">{formatNumber(totalSkillXp)} skill XP</Badge></div>} />
      <div className="relative">
        <Panel className="skill-flow h-[calc(100dvh-240px)] min-h-[520px] overflow-hidden">
          {events && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              colorMode={settings?.theme === 'light' ? 'light' : 'dark'}
              fitView
              fitViewOptions={{ padding: 0.08, minZoom: 0.45 }}
              minZoom={0.2}
              maxZoom={1.6}
              nodesConnectable={false}
              onNodeClick={(_, n) => !n.id.startsWith('branch-') && setSelected(n.id)}
              onPaneClick={() => setSelected(null)}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={28} size={1} color="var(--line-strong)" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={(n) => ((n.data as SkillNodeData)?.progress?.rank ? (n.data as SkillNodeData).color : 'var(--surface-3)')} maskColor="rgb(0 0 0 / 0.55)" style={{ background: 'var(--surface)' }} />
            </ReactFlow>
          )}
        </Panel>
        <AnimatePresence>
          {sel && (
            <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} className="panel absolute top-3 right-3 bottom-3 z-10 flex w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden bg-surface!" aria-label="Skill details">
              <div className="flex items-start gap-3 border-b border-line p-4">
                <ProgressRing value={sel.nextRankXp ? sel.progressToNext : 1} size={56} stroke={4} tone={SKILL_BRANCHES.find((b) => b.id === sel.skill.branch)!.color}>
                  <Icon name={sel.skill.icon} className="size-5" />
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <div className="eyebrow">{SKILL_BRANCHES.find((b) => b.id === sel.skill.branch)!.name}</div>
                  <h2 className="font-display text-lg font-semibold">{sel.skill.name}</h2>
                  <div className="text-xs text-fg-muted">{sel.unlocked ? `${sel.rankName} · rank ${sel.rank}/5` : 'Locked'}</div>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => setSelected(null)} aria-label="Close"><X /></Button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                <p className="text-sm text-fg-muted">{sel.skill.description}</p>
                <div>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-fg-muted">Skill XP</span><span className="font-num">{formatNumber(sel.xp)}{sel.nextRankXp ? ` / ${formatNumber(sel.nextRankXp)}` : ''}</span></div>
                  <ProgressBar value={sel.nextRankXp ? sel.progressToNext : 1} shimmer label="Progress to next rank" />
                  <div className="mt-2 flex flex-wrap gap-1">{SKILL_RANKS.slice(1).map((r) => <Badge key={r.rank} tone={sel.rank >= r.rank ? 'accent' : 'neutral'}>{r.name} · {formatNumber(r.xp)}</Badge>)}</div>
                </div>
                {sel.skill.prerequisites.length > 0 && (
                  <div>
                    <div className="eyebrow mb-2">Prerequisites</div>
                    {sel.skill.prerequisites.map((pre) => {
                      const pp = progress.get(pre)!;
                      return (
                        <button key={pre} onClick={() => setSelected(pre)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                          {pp.rank >= 1 ? <CheckCircle2 className="size-4 text-emerald" /> : <Lock className="size-4 text-fg-dim" />}
                          {pp.skill.name}
                          <span className="ml-auto text-xs text-fg-dim">rank {pp.rank}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div>
                  <div className="eyebrow mb-2">Associated quests · {related.filter((q) => q.status === 'done').length}/{related.length} completed</div>
                  {related.length === 0 && <p className="text-xs text-fg-dim">No quests mapped to this skill yet.</p>}
                  <div className="space-y-1">
                    {related.slice(0, 30).map((q) => (
                      <button key={q.id} onClick={() => openEditor(q.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                        {q.status === 'done' ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald" /> : <span className="size-2 shrink-0 rotate-45 border border-fg-dim" />}
                        <span className={cn('truncate', q.status === 'done' && 'text-fg-muted')}>{q.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-line p-3">
                <Button variant="primary" className="w-full" onClick={() => openEditor(undefined, { skillIds: [sel.skill.id], tags: [sel.skill.id] })}><Plus /> Add a quest for this skill</Button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-dim"><Sparkles className="size-3" /> Pan by dragging, zoom with the wheel or controls. Tags such as <code>#docker</code> on manual quests map them to skills.</p>
    </div>
  );
}
