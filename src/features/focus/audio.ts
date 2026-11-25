/**
 * Original ambient soundscapes synthesized in real time with the Web Audio API — no audio files,
 * no licensing concerns, works offline.
 */
export type Ambience = 'brown' | 'rain' | 'drone';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioNode[] = [];
let timers: number[] = [];

function context(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

function noiseBuffer(c: AudioContext, kind: 'white' | 'brown' | 'pink'): AudioBuffer {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = w;
    else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    } else {
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      data[i] = (b0 + b1 + b2 + w * 0.05) * 0.8;
    }
  }
  return buf;
}

export function stopAmbience(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
  for (const n of nodes) {
    try {
      (n as AudioScheduledSourceNode).stop?.();
    } catch {
      /* already stopped */
    }
    n.disconnect();
  }
  nodes = [];
}

export function setVolume(v: number): void {
  if (master && ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
}

export async function startAmbience(kind: Ambience, volume: number): Promise<void> {
  stopAmbience();
  const c = context();
  if (c.state === 'suspended') await c.resume();
  master = c.createGain();
  master.gain.value = 0;
  master.connect(c.destination);
  master.gain.setTargetAtTime(volume, c.currentTime, 0.8);
  nodes.push(master);

  if (kind === 'brown') {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 'brown');
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    src.connect(lp).connect(master);
    src.start();
    nodes.push(src, lp);
  } else if (kind === 'rain') {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 'pink');
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const bp = c.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 3200;
    bp.gain.value = 4;
    const g = c.createGain();
    g.gain.value = 0.7;
    src.connect(hp).connect(bp).connect(g).connect(master);
    src.start();
    // Gentle swells, like gusts of rain.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    nodes.push(src, hp, bp, g, lfo, lfoGain);
  } else {
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 4;
    filter.connect(master);
    const freqs = [55, 82.41, 110.3, 164.8];
    for (const [i, f] of freqs.entries()) {
      const o = c.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const g = c.createGain();
      g.gain.value = 0.12 / (i + 1);
      o.connect(g).connect(filter);
      o.start();
      nodes.push(o, g);
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05;
    const lg = c.createGain();
    lg.gain.value = 180;
    lfo.connect(lg).connect(filter.frequency);
    lfo.start();
    nodes.push(filter, lfo, lg);
  }
}

/** Soft two-tone bell played when a session ends. */
export async function chime(volume = 0.5): Promise<void> {
  try {
    const c = context();
    if (c.state === 'suspended') await c.resume();
    const now = c.currentTime;
    for (const [i, f] of [880, 1318.5].entries()) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, now + i * 0.18);
      g.gain.linearRampToValueAtTime(0.25 * volume, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 1.6);
      o.connect(g).connect(c.destination);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 1.7);
    }
  } catch {
    /* audio unavailable */
  }
}
