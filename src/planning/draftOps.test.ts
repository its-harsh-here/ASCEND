import { describe, expect, it } from 'vitest';
import { buildBriefing } from '@/domain/briefing';
import { DEFAULT_SETTINGS, questSchema } from '@/domain/types';
import { criticalPath } from './critical';
import { addQuest, deferGoals, dropOptional, editQuest, moveMilestone, removeQuest, setMilestone } from './draftOps';
import { generatePlan, type PlanInput } from './planner';

const input: PlanInput = {
  campaignName: 'T', objective: '', startDate: '2026-12-01', endDate: '2027-01-15', hoursPerDay: 4, workdays: [1, 2, 3, 4, 5],
  skillLevel: 'beginner',
  goals: [
    { id: 'd', templateId: 'docker', title: 'Docker', includeOptional: true, rank: 1 },
    { id: 'k', templateId: 'kubernetes', title: 'K8s', includeOptional: false, rank: 2 },
  ],
};

describe('plan review operations', () => {
  const plan = generatePlan(input);

  it('marks edited quests and reschedules when estimates change', () => {
    const q = plan.quests.find((x) => x.key === 'cli')!;
    const next = editQuest(plan, q.id, { hours: 3 });
    const e = next.quests.find((x) => x.id === q.id)!;
    expect(e.userEdited).toBe(true);
    expect(e.hours).toBe(3);
    expect(next.quests.find((x) => x.id === q.id)!.scheduledDate).toBeDefined();
  });

  it('removing a quest keeps the chain connected', () => {
    const mid = plan.quests.find((x) => x.key === 'cli')!;
    const after = plan.quests.find((x) => x.deps.includes(mid.id))!;
    const next = removeQuest(plan, mid.id);
    const a2 = next.quests.find((x) => x.id === after.id)!;
    expect(a2.deps).not.toContain(mid.id);
    for (const d of mid.deps) expect(a2.deps).toContain(d);
  });

  it('adds quests to milestones', () => {
    const ms = plan.milestones[0];
    const next = addQuest(plan, ms.id, 'Extra drill', 1.5);
    expect(next.quests.some((q) => q.title === 'Extra drill' && q.milestoneId === ms.id && q.scheduledDate)).toBe(true);
  });

  it('reorders milestones and re-links dependencies in the new order', () => {
    const msDocker = plan.milestones.filter((m) => m.goalId === 'd').sort((a, b) => a.order - b.order);
    const next = moveMilestone(plan, msDocker[1].id, -1);
    const firstOfMoved = next.quests.filter((q) => q.milestoneId === msDocker[1].id).sort((a, b) => a.order - b.order)[0];
    expect(firstOfMoved.deps.filter((d) => d.startsWith('d/'))).toEqual([]);
  });

  it('never moves a locked milestone deadline', () => {
    const ms = plan.milestones.find((m) => m.goalId === 'k')!;
    const locked = setMilestone(plan, ms.id, { dueDate: '2027-01-08', deadlineLocked: true });
    const again = editQuest(locked, locked.quests[0].id, { hours: 2 });
    expect(again.milestones.find((m) => m.id === ms.id)!.dueDate).toBe('2027-01-08');
  });

  it('drops optional quests and defers goals', () => {
    expect(dropOptional(plan).quests.some((q) => q.optional)).toBe(false);
    const d = deferGoals(plan, ['k']);
    expect(d.questlines.map((l) => l.id)).toEqual(['d']);
    expect(d.quests.some((q) => q.goalId === 'k')).toBe(false);
  });
});

describe('critical path', () => {
  it('finds the longest dependency chain', () => {
    const path = criticalPath([
      { id: 'a', hours: 2, deps: [] }, { id: 'b', hours: 5, deps: ['a'] }, { id: 'c', hours: 1, deps: ['a'] }, { id: 'd', hours: 1, deps: ['b', 'c'] },
    ]);
    expect(path).toEqual(['a', 'b', 'd']);
  });
});

describe('daily briefing', () => {
  const mk = (o: Record<string, unknown>) => questSchema.parse({ id: String(Math.random()), title: 't', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...o });
  it('recommends overdue, high-priority work and reports available time', () => {
    const quests = [
      mk({ title: 'Later', scheduledDate: '2026-11-25', priority: 'low', estimatedMinutes: 30 }),
      mk({ title: 'Overdue', scheduledDate: '2026-11-20', priority: 'high', estimatedMinutes: 60 }),
    ];
    const blocker = mk({ title: 'Prereq', scheduledDate: '2026-11-30', priority: 'low' });
    quests.push(blocker, mk({ title: 'Blocked', scheduledDate: '2026-11-25', priority: 'critical', dependencies: [blocker.id] }));
    const b = buildBriefing({ quests, settings: { ...DEFAULT_SETTINGS, dailyHours: 3, workdays: [0, 1, 2, 3, 4, 5, 6] }, today: '2026-11-25', timeBlocks: [{ id: 'b', title: 'Class', date: '2026-11-25', start: '10:00', end: '11:00', kind: 'commitment', notes: '' }] });
    expect(b.overdue.map((q) => q.title)).toEqual(['Overdue']);
    // Overdue high-priority work outranks a critical quest whose prerequisite is unfinished.
    expect(b.recommended?.quest.title).toBe('Overdue');
    expect(b.recommended?.reasons).toContain('overdue');
    expect(b.priorities.map((q) => q.title)).not.toContain('Blocked');
    expect(b.availableMinutes).toBe(120);
    expect(b.lines.join(' ')).toMatch(/overdue/);
  });
});
