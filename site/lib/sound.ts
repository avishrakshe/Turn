// Sound for the landing page's film, synthesised with Web Audio: no files to download.
//
// A tanpura-like drone (the Sa-Pa strings a family evening might have playing) that swells only
// while the film is moving and falls silent when it stops, coins clinking into the pot, a low
// thump and a rush of air when the pot is paid out, and small bells for the moments that matter.
//
// Nothing plays until the visitor asks for sound, and browsers only allow an audio context to
// start inside a click or key press, so `enable` must be called from one.

const KEY = "turn-sound";

type Listener = (on: boolean) => void;

// Sa = C3. The tanpura cycle: Pa (a fifth below), Sa, Sa, low Sa.
const SA = 130.81;
const STRINGS = [SA * 0.75, SA, SA, SA / 2];
const PLUCK_GAP = 0.85;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private nextPluck = 0;
  private pluck = 0;
  private lastClink = 0;
  private listeners = new Set<Listener>();
  on = false;

  /** The visitor's saved choice: true, false, or null if they haven't chosen yet. */
  saved(): boolean | null {
    try {
      const v = localStorage.getItem(KEY);
      return v === "on" ? true : v === "off" ? false : null;
    } catch {
      return null;
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Call from a click or key handler. */
  enable() {
    this.save("on");
    if (!this.ctx) this.build();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    void ctx.resume();
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.08);
    if (!this.timer) {
      this.nextPluck = ctx.currentTime + 0.05;
      this.timer = window.setInterval(() => this.schedule(), 120);
    }
    this.set(true);
  }

  disable() {
    this.save("off");
    const ctx = this.ctx;
    if (ctx && this.master) {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
      window.setTimeout(() => !this.on && void ctx.suspend(), 400);
    }
    window.clearInterval(this.timer);
    this.timer = 0;
    this.set(false);
  }

  toggle() {
    if (this.on) this.disable();
    else this.enable();
  }

  /** 0..1, how fast the film is moving. The drone follows it and is silent at rest. */
  motion(level: number) {
    if (!this.on || !this.ctx || !this.drone) return;
    const target = Math.min(1, Math.max(0, level)) * 0.5;
    this.drone.gain.setTargetAtTime(target, this.ctx.currentTime, target > this.drone.gain.value ? 0.12 : 0.35);
  }

  /** A coin landing. `pan` is -1 (left) … 1 (right). */
  clink(pan = 0, bright = 1) {
    const ctx = this.live();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastClink < 0.045) return;
    this.lastClink = now;
    const out = this.panner(pan);
    const f = (2100 + Math.random() * 600) * (0.85 + 0.15 * bright);
    for (const [ratio, gain, decay] of [
      [1, 0.14, 0.32],
      [2.76, 0.07, 0.18],
      [5.4, 0.03, 0.08],
    ] as const) {
      this.tone(f * ratio, gain, 0.002, decay, out, "sine", now);
    }
    this.burst(0.012, 5000, 0.05, out, now);
  }

  /** The pot lifting: a sub-bass thump (a 55 Hz sine falling to 36 Hz). */
  thump(intensity = 1) {
    const ctx = this.live();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.5);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.55 * intensity, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 1);
  }

  /** Air moving as the pot flies to its winner. */
  whoosh(intensity = 1) {
    const ctx = this.live();
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(260, now);
    bp.frequency.exponentialRampToValueAtTime(1900, now + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16 * intensity, now + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 1.4);
  }

  /** Small bells: "reveal" (bids opened), "miss" (a payment covered), "complete", "hello". */
  chime(kind: "reveal" | "miss" | "complete" | "hello") {
    const ctx = this.live();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes: Record<typeof kind, number[]> = {
      hello: [SA * 4, SA * 6],
      reveal: [SA * 4, SA * 6],
      miss: [SA * 3, SA * 2.4],
      complete: [SA * 4, SA * 5, SA * 6, SA * 8],
    };
    notes[kind].forEach((f, i) => {
      const at = now + i * (kind === "complete" ? 0.14 : 0.12);
      const level = kind === "miss" ? 0.07 : 0.09;
      this.tone(f, level, 0.004, 1.6, this.master!, "sine", at);
      this.tone(f * 2.01, level * 0.3, 0.004, 0.7, this.master!, "sine", at);
      this.tone(f * 3.02, level * 0.12, 0.004, 0.35, this.master!, "sine", at);
    });
  }

  // --- internals ------------------------------------------------------------------------------

  private set(on: boolean) {
    this.on = on;
    for (const fn of this.listeners) fn(on);
  }

  private save(v: "on" | "off") {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  }

  private live() {
    return this.on && this.ctx && this.ctx.state === "running" ? this.ctx : null;
  }

  private build() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp);

    // The drone bus: every pluck goes through a warm low-pass, and the bus level follows motion.
    const drone = ctx.createGain();
    drone.gain.value = 0;
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 1600;
    warm.Q.value = 0.6;
    drone.connect(warm).connect(master);
    // A quiet, steady Sa under the plucks so the drone never has gaps.
    for (const [f, g] of [
      [SA / 2, 0.05],
      [SA * 0.75, 0.025],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain).connect(drone);
      o.start();
    }

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.drone = drone;
    this.noise = noise;
  }

  /** Keeps tanpura plucks scheduled a little ahead of time. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.drone) return;
    if (this.nextPluck < ctx.currentTime) this.nextPluck = ctx.currentTime + 0.02;
    while (this.nextPluck < ctx.currentTime + 0.4) {
      const f = STRINGS[this.pluck % STRINGS.length]!;
      const at = this.nextPluck;
      // A sawtooth through a filter that closes after the pluck: the tanpura's buzzing bloom.
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 6;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 3;
      lp.frequency.setValueAtTime(2600, at);
      lp.frequency.exponentialRampToValueAtTime(700, at + 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.09, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 3.4);
      o.connect(lp).connect(g).connect(this.drone);
      o.start(at);
      o.stop(at + 3.5);
      this.pluck++;
      this.nextPluck += PLUCK_GAP;
    }
  }

  private tone(f: number, gain: number, attack: number, decay: number, out: AudioNode, type: OscillatorType, at: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + attack + decay + 0.05);
  }

  private burst(dur: number, hp: number, gain: number, out: AudioNode, at: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(out);
    src.start(at, Math.random());
    src.stop(at + dur + 0.02);
  }

  private panner(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!ctx.createStereoPanner) return this.master!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master!);
    return p;
  }
}

let engine: SoundEngine | null = null;

/** The page's one sound engine (browser only). */
export function getSound(): SoundEngine {
  engine ??= new SoundEngine();
  return engine;
}

export type { SoundEngine };
