import type { DraftMilestone, DraftPlan, DraftQuest } from './planner';
import { scheduleDraft } from './planner';

/** Pure, immutable edit operations used by the plan-review screen. Each returns a rescheduled draft. */

const clone = (p: DraftPlan): DraftPlan => ({
  ...p,
  input: { ...p.input, goals: p.input.goals.map((g) => ({ ...g })) },
  questlines: p.questlines.map((l) => ({ ...l })),
  milestones: p.milestones.map((m) => ({ ...m })),
  quests: p.quests.filter((q) => q.origin !== 'revision').map((q) => ({ ...q, deps: [...q.deps] })),
  recurring: p.recurring.map((r) => ({ ...r })),
  notes: [...p.notes],
});

export function editQuest(plan: DraftPlan, id: string, patch: Partial<DraftQuest>): DraftPlan {
  const p = clone(plan);
  const q = p.quests.find((x) => x.id === id);
  if (!q) return plan;
  Object.assign(q, patch, { userEdited: true });
  return scheduleDraft(p);
}

/** Remove a quest; anything that depended on it inherits its prerequisites so ordering is preserved. */
export function removeQuest(plan: DraftPlan, id: string): DraftPlan {
  const p = clone(plan);
  const victim = p.quests.find((x) => x.id === id);
  if (!victim) return plan;
  p.quests = p.quests.filter((x) => x.id !== id);
  for (const q of p.quests) {
    if (q.deps.includes(id)) q.deps = [...new Set([...q.deps.filter((d) => d !== id), ...victim.deps])];
  }
  return scheduleDraft(p);
}

export function addQuest(plan: DraftPlan, milestoneId: string, title: string, hours: number): DraftPlan {
  const p = clone(plan);
  const ms = p.milestones.find((m) => m.id === milestoneId);
  if (!ms) return plan;
  const inMs = p.quests.filter((q) => q.milestoneId === milestoneId).sort((a, b) => a.order - b.order);
  const last = inMs.filter((q) => !q.optional).pop();
  const order = (inMs[inMs.length - 1]?.order ?? Math.max(0, ...p.quests.map((q) => q.order))) + 0.5;
  const id = `${ms.goalId}/custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  p.quests.push({
    id, goalId: ms.goalId, milestoneId, key: id.split('/')[1], title, description: '', deliverable: '', hours,
    difficulty: 'medium', category: 'main', priority: 'medium', optional: false, deps: last ? [last.id] : [],
    skillIds: p.questlines.find((l) => l.id === ms.goalId)?.skillIds ?? [], deadlineLocked: false, userEdited: true, origin: 'manual', order,
  });
  return scheduleDraft(p);
}

/** Move a milestone up/down within its questline and re-link the questline's core quests in the new order. */
export function moveMilestone(plan: DraftPlan, milestoneId: string, dir: -1 | 1): DraftPlan {
  const p = clone(plan);
  const ms = p.milestones.find((m) => m.id === milestoneId);
  if (!ms) return plan;
  const siblings = p.milestones.filter((m) => m.goalId === ms.goalId).sort((a, b) => a.order - b.order);
  const i = siblings.indexOf(ms);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return plan;
  [siblings[i].order, siblings[j].order] = [siblings[j].order, siblings[i].order];
  relinkGoal(p, ms.goalId);
  return scheduleDraft(p);
}

export function relinkGoal(p: DraftPlan, goalId: string): void {
  const msOrder = new Map(p.milestones.filter((m) => m.goalId === goalId).map((m) => [m.id, m.order]));
  const quests = p.quests
    .filter((q) => q.goalId === goalId)
    .sort((a, b) => (msOrder.get(a.milestoneId) ?? 0) - (msOrder.get(b.milestoneId) ?? 0) || a.order - b.order);
  let prev: string | null = null;
  let order = Math.min(...quests.map((q) => q.order));
  for (const q of quests) {
    const external = q.deps.filter((d) => !d.startsWith(`${goalId}/`));
    q.deps = [...external, ...(prev ? [prev] : [])];
    q.order = order++;
    if (!q.optional) prev = q.id;
  }
}

export function setMilestone(plan: DraftPlan, milestoneId: string, patch: Partial<DraftMilestone>): DraftPlan {
  const p = clone(plan);
  const ms = p.milestones.find((m) => m.id === milestoneId);
  if (!ms) return plan;
  Object.assign(ms, patch);
  return scheduleDraft(p);
}

export function toggleRecurring(plan: DraftPlan, index: number, enabled: boolean): DraftPlan {
  const p = clone(plan);
  if (!p.recurring[index]) return plan;
  p.recurring[index].enabled = enabled;
  return scheduleDraft(p);
}

export function setPlanInput(plan: DraftPlan, patch: Partial<DraftPlan['input']>): DraftPlan {
  const p = clone(plan);
  p.input = { ...p.input, ...patch };
  return scheduleDraft(p);
}

/** Drop all optional quests (scope reduction). */
export function dropOptional(plan: DraftPlan): DraftPlan {
  const p = clone(plan);
  const ids = new Set(p.quests.filter((q) => q.optional).map((q) => q.id));
  p.quests = p.quests.filter((q) => !ids.has(q.id));
  for (const q of p.quests) q.deps = q.deps.filter((d) => !ids.has(d));
  for (const g of p.input.goals) g.includeOptional = false;
  return scheduleDraft(p);
}

/** Remove whole goals (prioritization). */
export function deferGoals(plan: DraftPlan, goalIds: string[]): DraftPlan {
  const p = clone(plan);
  const set = new Set(goalIds);
  const removed = new Set(p.quests.filter((q) => set.has(q.goalId)).map((q) => q.id));
  p.quests = p.quests.filter((q) => !removed.has(q.id));
  for (const q of p.quests) q.deps = q.deps.filter((d) => !removed.has(d));
  p.questlines = p.questlines.filter((l) => !set.has(l.id));
  p.milestones = p.milestones.filter((m) => !set.has(m.goalId));
  p.recurring = p.recurring.filter((r) => !set.has(r.goalId));
  p.input.goals = p.input.goals.filter((g) => !set.has(g.id));
  p.notes.push(`Deferred ${goalIds.length} goal${goalIds.length > 1 ? 's' : ''} to keep the plan realistic.`);
  return scheduleDraft(p);
}

export function editedCount(plan: DraftPlan, goalId: string): number {
  return plan.quests.filter((q) => q.goalId === goalId && q.userEdited).length;
}
