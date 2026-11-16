// EMBERFALL — WebAudio synthesis engine. Every sound is built from oscillators
// and filtered noise; the game ships no audio files. The context is created
// lazily on the first user gesture, so menus and staged screenshots stay silent.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.lastShotAt = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.42;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.42;
  }

  tone({ type = 'sine', from = 440, to = null, dur = 0.12, vol = 0.2, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.1, vol = 0.15, from = 800, to = 200, type = 'bandpass', delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  shoot() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastShotAt < 55) return; // throttle: volleys would clip
    this.lastShotAt = now;
    this.tone({ type: 'square', from: 840, to: 240, dur: 0.07, vol: 0.05 });
  }

  hit() {
    this.noise({ dur: 0.05, vol: 0.06, from: 2400, to: 900 });
  }

  kill() {
    this.tone({ type: 'sawtooth', from: 320, to: 55, dur: 0.18, vol: 0.11 });
    this.noise({ dur: 0.12, vol: 0.07, from: 1200, to: 200 });
  }

  pickup(combo) {
    const step = Math.min(combo, 12);
    this.tone({ type: 'sine', from: 620 + step * 45, to: 920 + step * 45, dur: 0.08, vol: 0.07 });
  }

  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, dur: 0.16, vol: 0.12, delay: i * 0.07 }));
  }

  hurt() {
    this.tone({ type: 'sawtooth', from: 170, to: 65, dur: 0.2, vol: 0.16 });
    this.noise({ dur: 0.14, vol: 0.1, from: 500, to: 120, type: 'lowpass' });
  }

  dash() {
    this.noise({ dur: 0.16, vol: 0.09, from: 300, to: 2600 });
  }

  bossRoar() {
    this.tone({ type: 'sawtooth', from: 58, to: 92, dur: 0.7, vol: 0.2 });
    this.tone({ type: 'sawtooth', from: 87, to: 130, dur: 0.7, vol: 0.12, delay: 0.05 });
    this.noise({ dur: 0.6, vol: 0.08, from: 220, to: 90, type: 'lowpass' });
  }

  waveStart() {
    this.tone({ type: 'triangle', from: 392, dur: 0.12, vol: 0.1 });
    this.tone({ type: 'triangle', from: 587, dur: 0.18, vol: 0.1, delay: 0.1 });
  }

  uiClick() {
    this.tone({ type: 'square', from: 1250, to: 900, dur: 0.04, vol: 0.06 });
  }

  gameOver() {
    [440, 349, 262, 196].forEach((f, i) =>
      this.tone({ type: 'triangle', from: f, dur: 0.3, vol: 0.12, delay: i * 0.16 }));
  }
}

export const sound = new SoundEngine();
