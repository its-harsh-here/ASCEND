import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd';

// Wednesday 25 Nov 2026, local time
const REF = new Date(2026, 10, 25, 10, 0, 0);

describe('quick add parser', () => {
  it('parses the canonical example', () => {
    const r = parseQuickAdd('Finish Docker networking tomorrow 2h #cloud !high', REF);
    expect(r.title).toBe('Finish Docker networking');
    expect(r.scheduledDate).toBe('2026-11-26');
    expect(r.estimatedMinutes).toBe(120);
    expect(r.tags).toEqual(['cloud']);
    expect(r.priority).toBe('high');
  });

  it('parses deadlines, weekdays, times, difficulty and category', () => {
    const r = parseQuickAdd('Write report due friday at 3pm ~hard @boss 1h30m', REF);
    expect(r.title).toBe('Write report');
    expect(r.dueDate).toBe('2026-11-27');
    expect(r.scheduledTime).toBe('15:00');
    expect(r.difficulty).toBe('hard');
    expect(r.category).toBe('boss');
    expect(r.estimatedMinutes).toBe(90);
  });

  it('parses relative and absolute dates', () => {
    expect(parseQuickAdd('a in 3 days', REF).scheduledDate).toBe('2026-11-28');
    expect(parseQuickAdd('a next week', REF).scheduledDate).toBe('2026-11-30');
    expect(parseQuickAdd('a 2026-12-24', REF).scheduledDate).toBe('2026-12-24');
    expect(parseQuickAdd('a dec 5', REF).scheduledDate).toBe('2026-12-05');
    expect(parseQuickAdd('a next wednesday', REF).scheduledDate).toBe('2026-12-02');
  });

  it('supports numeric priorities and campaign hints', () => {
    const r = parseQuickAdd('Ship it !1 +winter-break 45m', REF);
    expect(r.priority).toBe('critical');
    expect(r.campaignHint).toBe('winter break');
    expect(r.estimatedMinutes).toBe(45);
    expect(r.title).toBe('Ship it');
  });

  it('leaves plain text untouched', () => {
    const r = parseQuickAdd('Read chapter 4 of SICP', REF);
    expect(r.title).toBe('Read chapter 4 of SICP');
    expect(r.tokens).toHaveLength(0);
  });
});
