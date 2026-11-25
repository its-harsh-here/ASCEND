import { describe, expect, it } from 'vitest';
import { GOAL_TEMPLATES, resolveMilestones } from './catalog';
import { assessFeasibility } from './feasibility';
import { parseGoalText } from './goalParser';
import { generatePlan, regenerateGoal, type PlanInput } from './planner';
import { schedule, type SchedTask } from './scheduler';

const WINTER =
  'I have 30 days of winter break. I want to learn Docker, Kubernetes, AWS, improve DSA, contribute to open source, and build a research-worthy project. I have 6 hours available daily.';

describe('goal parser', () => {
  it('extracts goals, duration and daily hours from the winter-break example', () => {
    const r = parseGoalText(WINTER);
    expect(r.matches.map((m) => m.templateId).sort()).toEqual(['aws', 'docker', 'dsa', 'kubernetes', 'open-source', 'research'].sort());
    expect(r.durationDays).toBe(30);
    expect(r.hoursPerDay).toBe(6);
  });

  it('records the triggering keyword for transparency', () => {
    const r = parseGoalText('Prepare for technical interviews and learn k8s');
    expect(r.matches.find((m) => m.templateId === 'kubernetes')?.keyword.toLowerCase()).toBe('k8s');
    expect(r.matches.some((m) => m.templateId === 'interview')).toBe(true);
  });

  it('surfaces unrecognized goals instead of pretending to understand them', () => {
    const r = parseGoalText('I want to learn watercolor painting and improve DSA');
    expect(r.matches.map((m) => m.templateId)).toEqual(['dsa']);
    expect(r.unrecognized).toEqual(['Learn watercolor painting']);
  });

  it('parses quantities, skill level and alternative units', () => {
    const r = parseGoalText('Read 3 books over 2 weeks, 90 minutes a day. I am a complete beginner.');
    expect(r.matches[0]).toMatchObject({ templateId: 'reading', quantity: 3 });
    expect(r.durationDays).toBe(14);
    expect(r.hoursPerDay).toBe(1.5);
    expect(r.skillLevel).toBe('beginner');
  });
});

describe('goal catalog', () => {
  it('has unique quest keys and sane hours in every template', () => {
    for (const t of GOAL_TEMPLATES) {
      const keys = new Set<string>();
      for (const ms of resolveMilestones(t)) {
        expect(ms.quests.length).toBeGreaterThan(0);
        for (const q of ms.quests) {
          expect(keys.has(q.key), `${t.id}/${q.key}`).toBe(false);
          keys.add(q.key);
          expect(q.hours).toBeGreaterThan(0);
          expect(q.deliverable.length).toBeGreaterThan(5);
        }
      }
    }
  });
});

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    campaignName: 'Winter Break',
    objective: WINTER,
    startDate: '2026-12-01',
    endDate: '2026-12-30',
    hoursPerDay: 6,
    workdays: [0, 1, 2, 3, 4, 5, 6],
    skillLevel: 'intermediate',
    goals: ['docker', 'kubernetes', 'aws', 'dsa', 'open-source', 'research'].map((templateId, i) => ({
      id: `g${i}`, templateId, title: templateId, includeOptional: false, rank: i + 1,
    })),
    ...overrides,
  };
}

describe('planner + scheduler', () => {
  const plan = generatePlan(input());
  const byId = new Map(plan.quests.map((q) => [q.id, q]));

  it('creates questlines, milestones and quests for every goal', () => {
    expect(plan.questlines).toHaveLength(6);
    expect(plan.milestones.length).toBeGreaterThan(15);
    expect(plan.quests.filter((q) => q.origin === 'generated').length).toBeGreaterThan(60);
  });

  it('never schedules a quest before its dependencies', () => {
    for (const q of plan.quests) {
      if (!q.scheduledDate) continue;
      for (const d of q.deps) {
        const dep = byId.get(d)!;
        expect(dep.scheduledDate, `${q.id} depends on unscheduled ${d}`).toBeDefined();
        expect(dep.scheduledDate! <= q.scheduledDate).toBe(true);
      }
    }
  });

  it('never exceeds daily capacity', () => {
    for (const d of plan.schedule.days) expect(d.planned).toBeLessThanOrEqual(d.capacity + d.commitments * 0 + 0.011);
  });

  it('chains Kubernetes after the Docker images milestone', () => {
    const firstK8s = plan.quests.find((q) => q.goalId === 'g1' && !q.optional)!;
    expect(firstK8s.deps.some((d) => d.startsWith('g0/'))).toBe(true);
  });

  it('adds revision days and buffer days', () => {
    expect(plan.schedule.days.some((d) => d.kind === 'revision')).toBe(true);
    expect(plan.schedule.days.some((d) => d.kind === 'buffer')).toBe(true);
    expect(plan.quests.some((q) => q.origin === 'revision')).toBe(true);
  });

  it('skips foundation quests for advanced users and notes it', () => {
    const adv = generatePlan(input({ skillLevel: 'advanced', goals: [{ id: 'd', templateId: 'docker', title: 'docker', includeOptional: true, rank: 1 }] }));
    expect(adv.quests.some((q) => q.key === 'install')).toBe(false);
    expect(adv.notes.join(' ')).toMatch(/skipped 2 foundation/);
  });

  it('reports overload instead of silently overbooking', () => {
    const tiny = generatePlan(input({ endDate: '2026-12-07', hoursPerDay: 2 }));
    const report = assessFeasibility(tiny);
    expect(report.status).toBe('overloaded');
    expect(tiny.schedule.unscheduled.length).toBeGreaterThan(0);
    expect(report.options.map((o) => o.kind)).toEqual(expect.arrayContaining(['extend', 'hours', 'prioritize']));
    for (const d of tiny.schedule.days) expect(d.planned).toBeLessThanOrEqual(d.capacity + 0.011);
    const extend = report.options.find((o) => o.kind === 'extend')!;
    const fixed = generatePlan(input({ endDate: extend.endDate!, hoursPerDay: 2 }));
    expect(assessFeasibility(fixed).status).not.toBe('overloaded');
  });

  it('respects existing commitments', () => {
    const p = generatePlan(input({ commitments: { '2026-12-02': 6 }, goals: [{ id: 'd', templateId: 'docker', title: 'd', includeOptional: false, rank: 1 }] }));
    expect(p.quests.some((q) => q.scheduledDate === '2026-12-02')).toBe(false);
  });

  it('splits quests that are longer than a day', () => {
    const p = generatePlan(input({ hoursPerDay: 1, endDate: '2027-03-30', goals: [{ id: 'r', templateId: 'research', title: 'r', includeOptional: false, rank: 1 }] }));
    expect(p.quests.some((q) => q.title.includes('(part 1/'))).toBe(true);
    for (const q of p.quests) expect(q.hours).toBeLessThanOrEqual(1);
  });

  it('keeps user edits when regenerating a questline', () => {
    const p = generatePlan(input({ goals: [{ id: 'd', templateId: 'docker', title: 'd', includeOptional: false, rank: 1 }] }));
    const edited = p.quests.find((q) => q.key === 'cli')!;
    edited.title = 'My custom CLI drill';
    edited.userEdited = true;
    const { plan: regen, preserved } = regenerateGoal(p, 'd', false);
    expect(preserved).toBe(1);
    expect(regen.quests.find((q) => q.key === 'cli')!.title).toBe('My custom CLI drill');
    const { plan: overwritten } = regenerateGoal(p, 'd', true);
    expect(overwritten.quests.find((q) => q.key === 'cli')!.title).not.toBe('My custom CLI drill');
  });

  it('generates a generic scaffold for unknown goals', () => {
    const p = generatePlan(input({ goals: [{ id: 'x', title: 'Learn watercolor', includeOptional: false, rank: 1, customHours: 12 }] }));
    expect(p.quests.filter((q) => q.origin === 'generated').length).toBeGreaterThan(5);
    expect(p.notes.join(' ')).toMatch(/generic scaffold/);
  });
});

describe('scheduler constraints', () => {
  const base = { startDate: '2026-12-07', endDate: '2026-12-13', workdays: [1, 2, 3, 4, 5], hoursPerDay: 4, revisionEvery: 0, bufferRatio: 0 };
  const t = (id: string, hours: number, deps: string[] = [], extra: Partial<SchedTask> = {}): SchedTask => ({
    id, hours, deps, priority: 1, group: 'g', optional: false, order: 0, ...extra,
  });

  it('only schedules on workdays', () => {
    const r = schedule([t('a', 3), t('b', 3), t('c', 3)], base);
    for (const d of Object.values(r.assignments)) expect(['2026-12-12', '2026-12-13']).not.toContain(d);
  });

  it('meets a locked deadline by prioritizing it', () => {
    const r = schedule([t('a', 4), t('b', 4), t('c', 4, [], { lockedDue: '2026-12-07', priority: 0 })], base);
    expect(r.assignments.c).toBe('2026-12-07');
    expect(r.violations).toHaveLength(0);
  });

  it('reports a violated locked deadline', () => {
    const r = schedule([t('a', 4), t('b', 4, ['a'], { lockedDue: '2026-12-07' })], base);
    expect(r.violations).toHaveLength(1);
  });

  it('detects dependency cycles', () => {
    const r = schedule([t('a', 1, ['b']), t('b', 1, ['a']), t('c', 1)], base);
    expect(r.cycle.sort()).toEqual(['a', 'b']);
    expect(r.assignments.c).toBeDefined();
    expect(r.feasible).toBe(false);
  });
});
