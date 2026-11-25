import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/domain/types';
import { getProvider, ollamaProvider, suggestMilestones } from './providers';

afterEach(() => vi.unstubAllGlobals());

describe('local AI providers', () => {
  it('returns no provider when AI is disabled (the default)', () => {
    expect(getProvider(DEFAULT_SETTINGS.ai)).toBeNull();
  });

  it('reports Ollama as unavailable when unreachable, with guidance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const s = await ollamaProvider(DEFAULT_SETTINGS.ai).check();
    expect(s.available).toBe(false);
    expect(s.reason).toMatch(/OLLAMA_ORIGINS/);
  });

  it('reports a missing model instead of claiming availability', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'mistral:latest' }] }))));
    const s = await ollamaProvider(DEFAULT_SETTINGS.ai).check();
    expect(s.available).toBe(false);
    expect(s.reason).toMatch(/mistral/);
  });

  it('validates model output and rejects malformed responses', async () => {
    const good = { id: 'ollama' as const, label: 'x', check: vi.fn(), complete: vi.fn().mockResolvedValue('Sure! {"milestones":[{"title":"Sketch basics","hours":4}]}') };
    expect(await suggestMilestones(good, 'Learn drawing', '')).toEqual([{ title: 'Sketch basics', hours: 4 }]);
    const bad = { ...good, complete: vi.fn().mockResolvedValue('{"foo":1}') };
    await expect(suggestMilestones(bad, 'x', '')).rejects.toThrow(/format/);
  });
});
