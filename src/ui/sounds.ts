// Table sounds, made in the browser with Web Audio (no sound files): a chime when it is your turn,
// chips for bets, a tap for checks, a soft tick as cards are dealt and a rising note for a win.
// On by default; the choice is one of the player's preferences (Settings).

let enabled = true;
let level = 1;
export const DEFAULT_VOLUME = 0.7;

/** Sounds on or off, and how loud: follows the player's preferences (set by the app whenever they change). */
export function setSoundEnabled(on: boolean, volume = DEFAULT_VOLUME) {
  enabled = on;
  level = Math.max(0, Math.min(1, volume)) / DEFAULT_VOLUME;
}

/** The on/off choice saved by pages from before sounds were a preference (read once, to carry it over). */
export function legacySoundChoice(): boolean | null {
  try {
    const v = localStorage.getItem('live-sound');
    return v === null ? null : v !== 'off';
  } catch {
    return null;
  }
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, ms: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0) / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + ms / 1000);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (opts.gain ?? 0.15) * level), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

export const sounds = {
  /** your turn */
  turn: () => {
    tone(880, 160, { gain: 0.12 });
    tone(1320, 220, { gain: 0.1, delay: 120 });
  },
  /** a bet, raise or call */
  chips: () => {
    for (let k = 0; k < 3; k++) tone(2400 + k * 300, 40, { type: 'triangle', gain: 0.06, delay: k * 45 });
  },
  /** a check */
  check: () => tone(180, 70, { type: 'square', gain: 0.05 }),
  /** a fold */
  fold: () => tone(320, 90, { type: 'sine', gain: 0.04, slide: 200 }),
  /** cards going out */
  deal: () => tone(1500, 30, { type: 'triangle', gain: 0.04 }),
  /** you won a pot */
  win: () => [523, 659, 784].forEach((f, k) => tone(f, 180, { gain: 0.1, delay: k * 90 })),
};
