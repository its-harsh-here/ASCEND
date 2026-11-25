import { z } from 'zod';
import type { Settings } from '@/domain/types';

/**
 * Optional local AI.
 *
 * The app is fully functional without any model. A provider is only reported as available after a
 * real round-trip succeeds; nothing is ever claimed or faked. No API keys are used or stored.
 */

export interface AIStatus {
  available: boolean;
  provider: Settings['ai']['provider'];
  model?: string;
  reason?: string;
}

export interface AIProvider {
  id: 'ollama' | 'webllm';
  label: string;
  check(): Promise<AIStatus>;
  complete(prompt: string, opts?: { system?: string; json?: boolean; signal?: AbortSignal }): Promise<string>;
}

/* ───────────── Ollama (local HTTP) ───────────── */

export function ollamaProvider(cfg: Settings['ai']): AIProvider {
  const base = cfg.ollamaUrl.replace(/\/+$/, '');
  return {
    id: 'ollama',
    label: `Ollama · ${cfg.ollamaModel}`,
    async check() {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return { available: false, provider: 'ollama', reason: `Ollama responded with HTTP ${res.status}.` };
        const body = (await res.json()) as { models?: { name: string }[] };
        const names = (body.models ?? []).map((m) => m.name);
        const has = names.some((n) => n === cfg.ollamaModel || n.startsWith(`${cfg.ollamaModel}:`));
        if (!has) {
          return {
            available: false,
            provider: 'ollama',
            reason: names.length
              ? `Model “${cfg.ollamaModel}” not found. Installed: ${names.slice(0, 6).join(', ')}.`
              : `No models installed. Run: ollama pull ${cfg.ollamaModel}`,
          };
        }
        return { available: true, provider: 'ollama', model: cfg.ollamaModel };
      } catch (e) {
        const httpsPage = typeof location !== 'undefined' && location.protocol === 'https:';
        return {
          available: false,
          provider: 'ollama',
          reason:
            `Could not reach Ollama at ${base}. Make sure it is running and allows this site's origin ` +
            `(set OLLAMA_ORIGINS="${typeof location !== 'undefined' ? location.origin : '*'}").` +
            (httpsPage && base.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(base)
              ? ' Browsers block plain-HTTP requests to non-localhost hosts from HTTPS pages.'
              : '') +
            (e instanceof Error && e.name === 'AbortError' ? ' (timed out)' : ''),
        };
      }
    },
    async complete(prompt, opts) {
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: opts?.signal,
        body: JSON.stringify({ model: cfg.ollamaModel, prompt, system: opts?.system, stream: false, format: opts?.json ? 'json' : undefined }),
      });
      if (!res.ok) throw new Error(`Ollama error: HTTP ${res.status}`);
      const body = (await res.json()) as { response?: string };
      return body.response ?? '';
    },
  };
}

/* ───────────── WebLLM (in-browser, WebGPU) ───────────── */

const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm@0.2.79';
type WebLLMEngine = {
  chat: { completions: { create(req: unknown): Promise<{ choices: { message: { content: string } }[] }> } };
};
let enginePromise: Promise<WebLLMEngine> | null = null;

export function webgpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function webllmProvider(cfg: Settings['ai'], onProgress?: (text: string) => void): AIProvider {
  return {
    id: 'webllm',
    label: `WebLLM · ${cfg.webllmModel}`,
    async check() {
      if (!webgpuSupported()) return { available: false, provider: 'webllm', reason: 'This browser/device does not support WebGPU.' };
      if (!enginePromise) return { available: false, provider: 'webllm', reason: 'Model not loaded yet. Loading downloads model weights (hundreds of MB) once and caches them.' };
      try {
        await enginePromise;
        return { available: true, provider: 'webllm', model: cfg.webllmModel };
      } catch (e) {
        enginePromise = null;
        return { available: false, provider: 'webllm', reason: e instanceof Error ? e.message : 'Failed to load model.' };
      }
    },
    async complete(prompt, opts) {
      if (!enginePromise) throw new Error('WebLLM model is not loaded.');
      const engine = await enginePromise;
      const res = await engine.chat.completions.create({
        messages: [...(opts?.system ? [{ role: 'system', content: opts.system }] : []), { role: 'user', content: prompt }],
        temperature: 0.4,
        response_format: opts?.json ? { type: 'json_object' } : undefined,
      });
      void onProgress;
      return res.choices[0]?.message.content ?? '';
    },
  };
}

/** Explicit, user-initiated model download. Requires network on first use. */
export async function loadWebLLM(model: string, onProgress: (text: string, progress: number) => void): Promise<void> {
  if (!webgpuSupported()) throw new Error('WebGPU is not supported on this device.');
  enginePromise = (async () => {
    const mod = (await import(/* @vite-ignore */ WEBLLM_URL)) as {
      CreateMLCEngine: (m: string, o: { initProgressCallback: (r: { text: string; progress: number }) => void }) => Promise<WebLLMEngine>;
    };
    return mod.CreateMLCEngine(model, { initProgressCallback: (r) => onProgress(r.text, r.progress) });
  })();
  await enginePromise;
}

export function getProvider(cfg: Settings['ai']): AIProvider | null {
  if (cfg.provider === 'ollama') return ollamaProvider(cfg);
  if (cfg.provider === 'webllm') return webllmProvider(cfg);
  return null;
}

/* ───────────── Tasks ───────────── */

const milestoneSuggestionSchema = z.object({
  milestones: z.array(z.object({ title: z.string().min(1).max(120), hours: z.number().min(0.25).max(200).optional() })).min(1).max(12),
});

/** Ask a connected model for milestone suggestions. Output is validated; anything malformed is rejected. */
export async function suggestMilestones(provider: AIProvider, goal: string, context: string): Promise<{ title: string; hours?: number }[]> {
  const raw = await provider.complete(
    `Goal: ${goal}\nContext: ${context}\nPropose 3-7 sequential, concrete milestones to achieve this goal. ` +
      `Respond with JSON only: {"milestones":[{"title":"...","hours":number}]}`,
    { system: 'You are a pragmatic planning assistant. Be concise and concrete.', json: true },
  );
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The model did not return JSON.');
  const parsed = milestoneSuggestionSchema.safeParse(JSON.parse(match[0]));
  if (!parsed.success) throw new Error('The model response did not match the expected format.');
  return parsed.data.milestones;
}

export async function improveDescription(provider: AIProvider, title: string, description: string): Promise<string> {
  const out = await provider.complete(
    `Rewrite this task description to be clear and actionable, with a measurable definition of done. ` +
      `Max 80 words, plain text, no markdown.\nTitle: ${title}\nDescription: ${description || '(empty)'}`,
  );
  return out.trim().slice(0, 2000);
}

export async function summarizeReview(provider: AIProvider, facts: string): Promise<string> {
  const out = await provider.complete(
    `Write a short, encouraging but honest productivity summary (max 90 words, plain text) using ONLY these facts. ` +
      `Do not invent numbers.\n${facts}`,
  );
  return out.trim().slice(0, 2000);
}
