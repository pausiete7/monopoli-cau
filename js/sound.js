// Sons sintetitzats amb Web Audio (sense fitxers): cada so es construeix amb oscil·ladors i soroll filtrat.
// Es poden escoltar, apagar un per un i ajustar el volum a Configuració > Sons.

let ctx = null;
let master = null;
const PREF_KEY = 'monopoli-cau-sound';
let prefs = { volume: 0.8, off: [] };
let muted = false;
try {
  muted = localStorage.getItem('monopoli-cau-mute') === '1';
  prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
} catch { /* sense emmagatzematge */ }

const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* res */ } };
export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('monopoli-cau-mute', muted ? '1' : '0'); } catch { /* res */ }
  return muted;
}
export const getVolume = () => prefs.volume;
export function setVolume(v) { prefs.volume = Math.max(0, Math.min(1, v)); if (master) master.gain.value = prefs.volume; savePrefs(); }
export const isOff = (key) => prefs.off.includes(key);
export function setOff(key, off) { prefs.off = prefs.off.filter((k) => k !== key); if (off) prefs.off.push(key); savePrefs(); }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = prefs.volume;
    // compressor suau perquè els sons forts no saturin
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- Peces bàsiques ----------
function osc(freq, start, dur, { type = 'sine', gain = 0.2, to = null, attack = 0.005, curve = 'exp', vibrato = 0, vibRate = 6, filter = null } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
  if (vibrato) {
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = vibRate;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  else { g.gain.setValueAtTime(gain, t0 + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
  let node = o;
  if (filter) {
    const f = a.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.value = filter.freq;
    f.Q.value = filter.q || 1;
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(start, dur, { gain = 0.15, type = 'bandpass', freq = 2000, to = null, q = 1, attack = 0.003 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

// campana metàl·lica (moneda): fonamental + parcials inharmònics
function bell(freq, start, dur = 0.6, gain = 0.12) {
  [1, 2.76, 5.4, 8.9].forEach((m, k) => osc(freq * m, start, dur / (1 + k * 0.6), { type: 'sine', gain: gain / (1 + k * 1.4), attack: 0.002 }));
}

// ---------- Catàleg ----------
export const SOUNDS = {
  hop: {
    name: 'Salt de la fitxa',
    when: 'A cada casella que avança',
    play: () => { const f = rnd(520, 640); osc(f, 0, 0.09, { type: 'triangle', gain: 0.13, to: f * 0.7 }); noise(0, 0.02, { gain: 0.04, freq: 3000 }); },
  },
  land: {
    name: 'Arribar a la casella',
    when: 'Quan la fitxa acaba de moure\'s',
    play: () => { osc(170, 0, 0.18, { type: 'sine', gain: 0.25, to: 80 }); noise(0, 0.08, { gain: 0.06, type: 'lowpass', freq: 900 }); },
  },
  cash: {
    name: 'Cobrar (caixa registradora)',
    when: 'Quan un equip rep diners',
    play: () => {
      noise(0, 0.07, { gain: 0.1, type: 'highpass', freq: 3500 });
      osc(330, 0.02, 0.06, { type: 'square', gain: 0.05, filter: { freq: 1200 } });
      bell(rnd(1550, 1600), 0.07, 0.7, 0.1);
      bell(rnd(2080, 2120), 0.13, 0.8, 0.09);
    },
  },
  pay: {
    name: 'Pagar (monedes que cauen)',
    when: 'Quan un equip paga',
    play: () => { [0, 0.07, 0.15, 0.25].forEach((t, k) => bell(rnd(1300, 1500) - k * 140, t, 0.35, 0.06)); noise(0, 0.25, { gain: 0.03, freq: 5000 }); },
  },
  coins: {
    name: 'Pluja de monedes',
    when: 'En passar per la Sortida',
    play: () => { for (let k = 0; k < 9; k++) bell(rnd(1400, 2600), k * rnd(0.04, 0.07), 0.4, 0.05); },
  },
  flip: {
    name: 'Girar una carta',
    when: 'Quan surt una carta del mall',
    play: () => { noise(0, 0.22, { gain: 0.12, freq: 800, to: 4000, q: 0.8 }); osc(900, 0.2, 0.05, { type: 'triangle', gain: 0.06 }); },
  },
  good: {
    name: 'Bona notícia',
    when: 'Carta de Bona Acció, completar un grup',
    play: () => { [523, 659, 784, 1046].forEach((f, k) => { osc(f, k * 0.09, 0.32, { type: 'triangle', gain: 0.13 }); bell(f * 2, k * 0.09, 0.3, 0.025); }); },
  },
  bad: {
    name: 'Mala notícia (trombó)',
    when: 'Carta de Mal Rotllet',
    play: () => { [392, 370, 349, 294].forEach((f, k) => osc(f, k * 0.28, k === 3 ? 0.8 : 0.26, { type: 'sawtooth', gain: 0.07, filter: { freq: 900 }, vibrato: k === 3 ? 8 : 0, curve: 'lin' })); },
  },
  build: {
    name: 'Construir (martell)',
    when: 'Comprar o construir una casa',
    play: () => { [0, 0.16].forEach((t) => { noise(t, 0.06, { gain: 0.2, type: 'lowpass', freq: 1800 }); osc(240, t, 0.08, { type: 'square', gain: 0.06, filter: { freq: 900 } }); }); },
  },
  poof: {
    name: 'Núvol de pols',
    when: 'Quan cau una casa',
    play: () => { noise(0, 0.35, { gain: 0.1, type: 'lowpass', freq: 1200, to: 300 }); },
  },
  hotel: {
    name: 'Hotel (pop)',
    when: 'Quan 4 cases es converteixen en hotel',
    play: () => { osc(300, 0, 0.15, { type: 'sine', gain: 0.2, to: 900 }); [1568, 2093, 2637].forEach((f, k) => bell(f, 0.12 + k * 0.06, 0.4, 0.05)); },
  },
  stamp: {
    name: 'Segell',
    when: 'Multa i «Venut»',
    play: () => { osc(140, 0, 0.22, { type: 'sine', gain: 0.35, to: 55 }); noise(0, 0.12, { gain: 0.18, type: 'lowpass', freq: 700 }); },
  },
  jail: {
    name: 'Presó (porta i sirena)',
    when: 'Quan un equip va a la presó',
    play: () => {
      noise(0, 0.25, { gain: 0.16, type: 'bandpass', freq: 1200, q: 4 });
      osc(110, 0, 0.3, { type: 'square', gain: 0.06, filter: { freq: 500 } });
      for (let k = 0; k < 3; k++) {
        osc(700, 0.3 + k * 0.5, 0.25, { type: 'sawtooth', gain: 0.045, filter: { freq: 2200 }, curve: 'lin' });
        osc(540, 0.55 + k * 0.5, 0.25, { type: 'sawtooth', gain: 0.045, filter: { freq: 2200 }, curve: 'lin' });
      }
    },
  },
  whistle: {
    name: 'Xiulet de tren',
    when: 'Caure o comprar una estació',
    play: () => { [880, 1108].forEach((f) => osc(f, 0, 0.9, { type: 'sine', gain: 0.07, vibrato: 6, vibRate: 7, attack: 0.08, curve: 'lin' })); noise(0, 0.9, { gain: 0.03, freq: 2500, q: 2 }); },
  },
  gavel: {
    name: 'Martell de subhasta',
    when: 'Quan s\'adjudica una subhasta',
    play: () => { [0, 0.22, 0.44].forEach((t, k) => { noise(t, 0.05, { gain: 0.22, type: 'bandpass', freq: 900, q: 2 }); osc(420 - k * 40, t, 0.07, { type: 'triangle', gain: 0.1 }); }); },
  },
  turn: {
    name: 'Canvi de torn',
    when: 'Quan es passa el torn',
    play: () => { osc(784, 0, 0.4, { type: 'sine', gain: 0.12 }); osc(1175, 0.12, 0.5, { type: 'sine', gain: 0.1 }); bell(2350, 0.12, 0.4, 0.02); },
  },
  click: {
    name: 'Clic',
    when: 'Pujar en una subhasta, triar al minijoc',
    play: () => { osc(1000, 0, 0.03, { type: 'triangle', gain: 0.06 }); },
  },
  tick: {
    name: 'Ruleta',
    when: 'Mentre gira la ruleta del minijoc',
    play: () => { noise(0, 0.02, { gain: 0.1, type: 'highpass', freq: 3000 }); osc(rnd(1700, 1900), 0, 0.02, { type: 'square', gain: 0.03 }); },
  },
  bankrupt: {
    name: 'Fallida',
    when: 'Quan un equip queda fora',
    play: () => { osc(600, 0, 1.1, { type: 'sawtooth', gain: 0.06, to: 90, filter: { freq: 1500 } }); osc(70, 1.0, 0.5, { type: 'sine', gain: 0.3, to: 40 }); },
  },
  winner: {
    name: 'Fanfàrria de guanyador',
    when: 'Quan es proclama el guanyador',
    play: () => {
      const notes = [[392, 0, 0.18], [392, 0.2, 0.18], [392, 0.4, 0.18], [523, 0.6, 0.7], [659, 1.0, 0.25], [784, 1.3, 0.9]];
      notes.forEach(([f, t, d]) => { osc(f, t, d, { type: 'sawtooth', gain: 0.07, filter: { freq: 2400 }, curve: 'lin' }); osc(f * 2, t, d, { type: 'triangle', gain: 0.03, curve: 'lin' }); });
      for (let k = 0; k < 6; k++) bell(rnd(1800, 3000), 1.3 + k * 0.08, 0.5, 0.03);
    },
  },
};

// sfx.nom() reprodueix el so si no està silenciat ni apagat
export const sfx = new Proxy({}, {
  get: (_, key) => () => {
    if (muted || !SOUNDS[key] || isOff(key)) return;
    try { SOUNDS[key].play(); } catch { /* àudio no disponible */ }
  },
});

// per a la pestanya Sons: escoltar-lo encara que estigui apagat
export function preview(key) {
  try { SOUNDS[key]?.play(); } catch { /* res */ }
}
