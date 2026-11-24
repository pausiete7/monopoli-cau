// Sons sintetitzats amb Web Audio (sense fitxers).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('monopoli-cau-mute') === '1'; } catch { /* res */ }

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('monopoli-cau-mute', muted ? '1' : '0'); } catch { /* res */ }
  return muted;
}

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.18, slide = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(start, dur, gain = 0.12) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1800;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

export const sfx = {
  hop() { if (!muted) tone(520 + Math.random() * 60, 0, 0.07, { type: 'triangle', gain: 0.12 }); },
  land() { if (!muted) { tone(300, 0, 0.12, { type: 'triangle', gain: 0.2 }); tone(450, 0.05, 0.1, { type: 'sine', gain: 0.1 }); } },
  cash() { if (!muted) { tone(1318, 0, 0.09, { type: 'square', gain: 0.07 }); tone(1760, 0.08, 0.16, { type: 'square', gain: 0.07 }); noise(0, 0.08, 0.05); } },
  pay() { if (!muted) { tone(660, 0, 0.12, { type: 'sawtooth', gain: 0.06, slide: -260 }); tone(440, 0.1, 0.18, { type: 'sawtooth', gain: 0.06, slide: -200 }); } },
  jail() {
    if (muted) return;
    for (let k = 0; k < 3; k++) { tone(760, k * 0.36, 0.18, { type: 'square', gain: 0.06 }); tone(560, k * 0.36 + 0.18, 0.18, { type: 'square', gain: 0.06 }); }
  },
  flip() { if (!muted) { noise(0, 0.12, 0.09); tone(880, 0.05, 0.1, { gain: 0.06 }); } },
  good() { if (!muted) [523, 659, 784, 1046].forEach((f, k) => tone(f, k * 0.08, 0.22, { type: 'triangle', gain: 0.12 })); },
  bad() { if (!muted) [392, 330, 262].forEach((f, k) => tone(f, k * 0.12, 0.25, { type: 'sawtooth', gain: 0.05 })); },
  build() { if (!muted) { noise(0, 0.05, 0.12); tone(220, 0, 0.08, { type: 'square', gain: 0.08 }); noise(0.12, 0.05, 0.12); tone(260, 0.12, 0.08, { type: 'square', gain: 0.08 }); } },
  click() { if (!muted) tone(900, 0, 0.03, { type: 'triangle', gain: 0.05 }); },
};
