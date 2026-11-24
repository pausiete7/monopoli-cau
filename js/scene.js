// Tauler en 3D amb Three.js: tauler, peons, cases, piles de cartes i animacions.
import * as THREE from '../vendor/three.module.min.js';
import { state, sq, N, team, money, rentFor, rules } from './engine.js';
import { photoOf, initials } from './util.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Geometria ----------
const C = 1.6; // cantonada
const W = 1; // casella
const BAND = 0.27;
const per = () => N() / 4;
const L = () => 2 * C + (per() - 1) * W;

function rect(i) {
  const p = per();
  const h = L() / 2;
  if (i === 0) return { x0: h - C, x1: h, z0: h - C, z1: h, side: 'c', corner: 'br' };
  if (i < p) { const x1 = h - C - (i - 1) * W; return { x0: x1 - W, x1, z0: h - C, z1: h, side: 'b' }; }
  if (i === p) return { x0: -h, x1: -h + C, z0: h - C, z1: h, side: 'c', corner: 'bl' };
  if (i < 2 * p) { const z1 = h - C - (i - p - 1) * W; return { x0: -h, x1: -h + C, z0: z1 - W, z1, side: 'l' }; }
  if (i === 2 * p) return { x0: -h, x1: -h + C, z0: -h, z1: -h + C, side: 'c', corner: 'tl' };
  if (i < 3 * p) { const x0 = -h + C + (i - 2 * p - 1) * W; return { x0, x1: x0 + W, z0: -h, z1: -h + C, side: 't' }; }
  if (i === 3 * p) return { x0: h - C, x1: h, z0: -h, z1: -h + C, side: 'c', corner: 'tr' };
  const z0 = -h + C + (i - 3 * p - 1) * W;
  return { x0: h - C, x1: h, z0, z1: z0 + W, side: 'r' };
}
const center = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });

// ---------- Tweens (amb seguretat si la pestanya queda en segon pla) ----------
const tweens = new Set();
const ease = {
  inOut: (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  out: (p) => 1 - (1 - p) ** 3,
  back: (p) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2; },
  bounce: (p) => {
    const n1 = 7.5625; const d1 = 2.75;
    if (p < 1 / d1) return n1 * p * p;
    if (p < 2 / d1) { p -= 1.5 / d1; return n1 * p * p + 0.75; }
    if (p < 2.5 / d1) { p -= 2.25 / d1; return n1 * p * p + 0.9375; }
    p -= 2.625 / d1; return n1 * p * p + 0.984375;
  },
  linear: (p) => p,
};
function tween(dur, fn, e = ease.inOut) {
  if (reduced()) dur = 1;
  return new Promise((res) => {
    const t = { start: performance.now(), dur, fn, e, res };
    tweens.add(t);
    t.timer = setTimeout(() => { if (tweens.has(t)) { tweens.delete(t); fn(1); res(); } }, dur + 250);
  });
}
function stepTweens(now) {
  tweens.forEach((t) => {
    const p = Math.min(1, (now - t.start) / t.dur);
    t.fn(t.e(p));
    if (p >= 1) { tweens.delete(t); clearTimeout(t.timer); t.res(); }
  });
}

// ---------- Dibuix del tauler (canvas → textura) ----------
const TEX = 4096;
const INK = '#1C1A3A';
const PAPER = '#FFFFFF';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setFont(ctx, weight, size, stretch = 'normal') {
  ctx.font = `${weight} ${size}px "Anybody", "Arial Narrow", sans-serif`;
  try { ctx.fontStretch = stretch; } catch { /* navegador antic */ }
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = w; }
  });
  if (line) lines.push(line);
  return lines;
}

// escriu un text dins d'una caixa, reduint la mida fins que hi càpiga
function fitText(ctx, text, cx, top, maxW, maxH, { size = 64, min = 26, weight = 800, stretch = 'condensed', color = INK, lh = 1.04, maxLines = 3 } = {}) {
  let s = size;
  let lines;
  for (; s >= min; s -= 2) {
    setFont(ctx, weight, s, stretch);
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.length * s * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, k) => ctx.fillText(l, cx, top + k * s * lh));
  return lines.length * s * lh;
}

function drawTrain(ctx, cx, cy, s) {
  // frontal d'un tren, dibuixat
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  const body = ctx.createLinearGradient(0, -50, 0, 50);
  body.addColorStop(0, '#3B3F8F');
  body.addColorStop(1, '#22245E');
  roundRect(ctx, -38, -48, 76, 86, 22);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundRect(ctx, -28, -38, 56, 30, 8);
  ctx.fillStyle = '#BFE7FF';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath(); ctx.moveTo(-22, -34); ctx.lineTo(-8, -34); ctx.lineTo(-20, -12); ctx.lineTo(-26, -12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFD84D';
  ctx.beginPath(); ctx.arc(-20, 14, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(20, 14, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#E8473B';
  roundRect(ctx, -12, 24, 24, 6, 3); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-24, 40); ctx.lineTo(-36, 56); ctx.moveTo(24, 40); ctx.lineTo(36, 56); ctx.stroke();
  ctx.restore();
}

function drawRails(ctx, x, y, w, h, vertical) {
  ctx.fillStyle = '#2A2C5E';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8C7A5B';
  ctx.lineWidth = 10;
  const n = 7;
  for (let k = 0; k < n; k++) {
    ctx.beginPath();
    if (vertical) { const yy = y + (h / n) * (k + 0.5); ctx.moveTo(x + w * 0.15, yy); ctx.lineTo(x + w * 0.85, yy); }
    else { const xx = x + (w / n) * (k + 0.5); ctx.moveTo(xx, y + h * 0.15); ctx.lineTo(xx, y + h * 0.85); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#D9DCEB';
  ctx.lineWidth = 8;
  ctx.beginPath();
  if (vertical) { ctx.moveTo(x + w * 0.32, y); ctx.lineTo(x + w * 0.32, y + h); ctx.moveTo(x + w * 0.68, y); ctx.lineTo(x + w * 0.68, y + h); }
  else { ctx.moveTo(x, y + h * 0.32); ctx.lineTo(x + w, y + h * 0.32); ctx.moveTo(x, y + h * 0.68); ctx.lineTo(x + w, y + h * 0.68); }
  ctx.stroke();
}

function drawGo(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#FFF7D6');
  g.addColorStop(1, '#FFE08A');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-Math.PI / 4);
  setFont(ctx, 900, 150, 'expanded');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 18;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.strokeText('SORTIDA', 0, -40);
  ctx.fillStyle = '#E8473B';
  ctx.fillText('SORTIDA', 0, -40);
  setFont(ctx, 800, 60, 'semi-condensed');
  ctx.fillStyle = INK;
  ctx.fillText(`Cobra ${money(rules().goSalary)}`, 0, 70);
  ctx.restore();
  // fletxa gruixuda cap a l'esquerra (sentit del joc)
  ctx.save();
  ctx.translate(x + w * 0.5, y + h * 0.86);
  const aw = w * 0.62;
  ctx.beginPath();
  ctx.moveTo(-aw / 2, 0);
  ctx.lineTo(-aw / 2 + 90, -70);
  ctx.lineTo(-aw / 2 + 90, -30);
  ctx.lineTo(aw / 2, -30);
  ctx.lineTo(aw / 2, 30);
  ctx.lineTo(-aw / 2 + 90, 30);
  ctx.lineTo(-aw / 2 + 90, 70);
  ctx.closePath();
  const ag = ctx.createLinearGradient(0, -70, 0, 70);
  ag.addColorStop(0, '#FF6B5B');
  ag.addColorStop(1, '#C92A1F');
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawJail(ctx, x, y, w, h, name) {
  ctx.fillStyle = '#FFF2E0';
  ctx.fillRect(x, y, w, h);
  // la cel·la ocupa la part interior (dalt a la dreta)
  const cw = w * 0.66;
  const cx = x + w - cw;
  const cy = y;
  const wall = ctx.createLinearGradient(cx, cy, cx, cy + cw);
  wall.addColorStop(0, '#7E8AA8');
  wall.addColorStop(1, '#4C5674');
  ctx.fillStyle = wall;
  ctx.fillRect(cx, cy, cw, cw);
  // maons
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 6;
  for (let r = 0; r < 7; r++) {
    const yy = cy + (cw / 7) * r;
    ctx.beginPath(); ctx.moveTo(cx, yy); ctx.lineTo(cx + cw, yy); ctx.stroke();
    for (let c = 0; c < 5; c++) {
      const xx = cx + (cw / 4) * c + (r % 2 ? cw / 8 : 0);
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + cw / 7); ctx.stroke();
    }
  }
  // presoner (silueta amb samarreta de ratlles)
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, cw, cw);
  ctx.clip();
  const px = cx + cw * 0.5;
  const py = cy + cw * 0.62;
  ctx.fillStyle = '#F2C9A0';
  ctx.beginPath(); ctx.arc(px, py - 70, 62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(px - 22, py - 78, 9, 0, Math.PI * 2); ctx.arc(px + 22, py - 78, 9, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(px, py - 40, 18, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k % 2 ? '#FFFFFF' : INK;
    ctx.fillRect(px - 110, py + k * 34, 220, 34);
  }
  ctx.restore();
  // barrots
  for (let k = 1; k < 6; k++) {
    const bx = cx + (cw / 6) * k;
    const bg = ctx.createLinearGradient(bx - 14, 0, bx + 14, 0);
    bg.addColorStop(0, '#5A5E6E');
    bg.addColorStop(0.45, '#E6E9F2');
    bg.addColorStop(1, '#4A4D5C');
    ctx.fillStyle = bg;
    roundRect(ctx, bx - 14, cy, 28, cw, 12);
    ctx.fill();
  }
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.strokeRect(cx, cy, cw, cw);
  // cartell
  setFont(ctx, 900, 84, 'expanded');
  const tw = ctx.measureText(name.toUpperCase()).width + 60;
  roundRect(ctx, cx + cw / 2 - tw / 2, cy + cw - 120, tw, 100, 18);
  ctx.fillStyle = '#FFB020';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), cx + cw / 2, cy + cw - 68);
  // "només de visita" a la franja exterior
  setFont(ctx, 800, 56, 'condensed');
  ctx.fillStyle = INK;
  ctx.save();
  ctx.translate(x + (w - cw) / 2, y + cw / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('NOMÉS DE', 0, -8);
  ctx.restore();
  ctx.fillText('VISITA', x + w / 2, y + h - (h - cw) / 2);
}

function drawTax(ctx, x, y, w, h, s) {
  ctx.fillStyle = '#EEF2FF';
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(Math.PI / 4);
  // paper de multa
  ctx.save();
  ctx.rotate(-0.08);
  roundRect(ctx, -170, -230, 340, 420, 18);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#C9CEDF';
  for (let k = 0; k < 5; k++) roundRect(ctx, -120, -150 + k * 50, k === 4 ? 140 : 240, 18, 9), ctx.fill();
  ctx.restore();
  // segell
  ctx.save();
  ctx.translate(40, 110);
  ctx.rotate(-0.25);
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#E8473B';
  ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 98, 0, Math.PI * 2); ctx.stroke();
  setFont(ctx, 900, 70, 'expanded');
  ctx.fillStyle = '#E8473B';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s.name.toUpperCase(), 0, -6);
  setFont(ctx, 800, 40, 'condensed');
  ctx.fillText(money(s.amount), 0, 52);
  ctx.restore();
  ctx.restore();
}

function drawGoToJail(ctx, x, y, w, h, name) {
  ctx.fillStyle = '#E9F1FF';
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-Math.PI / 4);
  // llum de sirena
  ctx.save();
  ctx.translate(0, -40);
  const glow = ctx.createRadialGradient(0, -40, 10, 0, -40, 260);
  glow.addColorStop(0, 'rgba(255,70,70,.55)');
  glow.addColorStop(1, 'rgba(255,70,70,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, -40, 260, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-110, 60);
  ctx.lineTo(-110, -40);
  ctx.quadraticCurveTo(-110, -150, 0, -150);
  ctx.quadraticCurveTo(110, -150, 110, -40);
  ctx.lineTo(110, 60);
  ctx.closePath();
  const dome = ctx.createLinearGradient(-110, 0, 110, 0);
  dome.addColorStop(0, '#FF4B4B');
  dome.addColorStop(0.5, '#FF8A80');
  dome.addColorStop(1, '#D81E1E');
  ctx.fillStyle = dome;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  roundRect(ctx, -70, -110, 30, 120, 15);
  ctx.fill();
  roundRect(ctx, -150, 60, 300, 56, 14);
  ctx.fillStyle = '#3B3F8F';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  setFont(ctx, 900, 84, 'semi-expanded');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = PAPER;
  ctx.lineJoin = 'round';
  const words = name.toUpperCase().split(' ');
  const mid = Math.ceil(words.length / 2);
  const l1 = words.slice(0, mid).join(' ');
  const l2 = words.slice(mid).join(' ');
  ctx.fillStyle = INK;
  ctx.strokeText(l1, 0, 160); ctx.fillText(l1, 0, 160);
  if (l2) { ctx.strokeText(l2, 0, 250); ctx.fillText(l2, 0, 250); }
  ctx.restore();
}

function drawCenter(ctx, x, y, w, h) {
  const g = ctx.createRadialGradient(x + w / 2, y + h * 0.4, 50, x + w / 2, y + h / 2, w * 0.75);
  g.addColorStop(0, '#F3F7FF');
  g.addColorStop(1, '#D9E3F7');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // corbes de nivell
  ctx.strokeStyle = 'rgba(80,100,170,.16)';
  ctx.lineWidth = 6;
  const rings = (cx, cy, n, rx, ry, rot) => {
    for (let k = 0; k < n; k++) {
      const f = 1 - k / (n + 0.6);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * f, ry * f * (1 + k * 0.04), k * 0.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };
  rings(x + w * 0.2, y + h * 0.82, 7, w * 0.32, h * 0.2, -0.2);
  rings(x + w * 0.82, y + h * 0.18, 6, w * 0.28, h * 0.17, 0.3);
  // logotip
  const cx = x + w / 2;
  const ty = y + h * 0.17;
  ctx.save();
  ctx.translate(cx, ty);
  ctx.rotate(-0.05);
  setFont(ctx, 900, 330, 'expanded');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 46;
  ctx.strokeStyle = INK;
  ctx.strokeText('Monopoli', 0, 18);
  ctx.lineWidth = 28;
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeText('Monopoli', 0, 0);
  const lg = ctx.createLinearGradient(0, -150, 0, 150);
  lg.addColorStop(0, '#FF6B5B');
  lg.addColorStop(1, '#D3261B');
  ctx.fillStyle = lg;
  ctx.fillText('Monopoli', 0, 0);
  // cinta "del Cau"
  ctx.translate(0, 205);
  roundRect(ctx, -260, -62, 520, 124, 62);
  ctx.fillStyle = INK;
  ctx.fill();
  setFont(ctx, 850, 92, 'semi-expanded');
  ctx.fillStyle = '#FFD84D';
  ctx.fillText('del Cau', 0, 4);
  ctx.restore();
  setFont(ctx, 700, 52, 'normal');
  ctx.fillStyle = 'rgba(28,26,58,.6)';
  ctx.textAlign = 'center';
  ctx.fillText("Pioners i Caravel·les de l'AE Albada", cx, y + h * 0.43);
}

export function drawBoard(canvas) {
  const ctx = canvas.getContext('2d');
  const s = TEX / L();
  const px = (v) => (v + L() / 2) * s;
  ctx.clearRect(0, 0, TEX, TEX);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, TEX, TEX);
  // centre
  const c0 = px(-L() / 2 + C);
  const c1 = px(L() / 2 - C);
  drawCenter(ctx, c0 + 6, c0 + 6, c1 - c0 - 12, c1 - c0 - 12);

  for (let i = 0; i < N(); i++) {
    const r = rect(i);
    const gap = 7;
    const x = px(r.x0) + gap;
    const y = px(r.z0) + gap;
    const w = (r.x1 - r.x0) * s - gap * 2;
    const h = (r.z1 - r.z0) * s - gap * 2;
    const cell = sq(i);
    ctx.save();
    roundRect(ctx, x, y, w, h, 26);
    ctx.clip();
    ctx.fillStyle = PAPER;
    ctx.fillRect(x, y, w, h);
    if (r.side === 'c') {
      if (cell.type === 'go') drawGo(ctx, x, y, w, h);
      else if (cell.type === 'jail') drawJail(ctx, x, y, w, h, cell.name);
      else if (cell.type === 'tax') drawTax(ctx, x, y, w, h, cell);
      else if (cell.type === 'gotojail') drawGoToJail(ctx, x, y, w, h, cell.name);
      else { setFont(ctx, 900, 90); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(cell.name, x + w / 2, y + h / 2); }
    } else {
      const b = BAND * s;
      let band;
      let body;
      if (r.side === 'b') { band = [x, y, w, b]; body = [x, y + b, w, h - b]; }
      else if (r.side === 't') { band = [x, y + h - b, w, b]; body = [x, y, w, h - b]; }
      else if (r.side === 'l') { band = [x + w - b, y, b, h]; body = [x, y, w - b, h]; }
      else { band = [x, y, b, h]; body = [x + b, y, w - b, h]; }
      const [bx, by, bw, bh] = body;
      const pad = 26;
      const priceH = 86;
      // a la part exterior hi va el preu (i la placa de l'amo, en 3D)
      const nameTop = r.side === 't' ? by + priceH + pad : by + pad;
      const priceY = r.side === 't' ? by + pad + 8 : by + bh - priceH + 8;
      if (cell.type === 'prop') {
        const col = state.config.groups[cell.group]?.color || '#999';
        ctx.fillStyle = col;
        ctx.fillRect(...band);
        const sh = ctx.createLinearGradient(band[0], band[1], band[0] + (r.side === 'l' || r.side === 'r' ? band[2] : 0), band[1] + (r.side === 'b' || r.side === 't' ? band[3] : 0));
        sh.addColorStop(0, 'rgba(255,255,255,.28)');
        sh.addColorStop(1, 'rgba(0,0,0,.12)');
        ctx.fillStyle = sh;
        ctx.fillRect(...band);
        fitText(ctx, cell.name.toUpperCase(), bx + bw / 2, nameTop, bw - pad * 2, bh - priceH - pad * 2.2, { size: r.side === 'l' || r.side === 'r' ? 72 : 70, maxLines: r.side === 'l' || r.side === 'r' ? 2 : 4 });
      } else if (cell.type === 'station') {
        drawRails(ctx, ...band, r.side === 'l' || r.side === 'r');
        const wide = r.side === 'l' || r.side === 'r';
        if (wide) {
          drawTrain(ctx, bx + 120, by + bh * 0.4, 150);
          fitText(ctx, cell.name.toUpperCase(), bx + 120 + (bw - 120) / 2 + 30, nameTop, bw - 300, bh - priceH - pad * 2, { size: 64, maxLines: 2 });
        } else {
          const th = fitText(ctx, cell.name.toUpperCase(), bx + bw / 2, nameTop, bw - pad * 2, (bh - priceH) * 0.42, { size: 64, maxLines: 3 });
          drawTrain(ctx, bx + bw / 2, nameTop + th + (bh - priceH - th) * 0.42, 210);
        }
      } else {
        fitText(ctx, cell.name.toUpperCase(), bx + bw / 2, nameTop, bw - pad * 2, bh - priceH - pad * 2, { size: 70 });
      }
      if (cell.price) {
        setFont(ctx, 800, 60, 'normal');
        ctx.fillStyle = '#5B5A7A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(money(cell.price), bx + bw / 2, priceY);
      }
    }
    ctx.restore();
  }
}

// ---------- Models 3D ----------
const MAT = {};
function mats() {
  if (MAT.ready) return MAT;
  MAT.houseBody = new THREE.MeshStandardMaterial({ color: 0x35B865, roughness: 0.45 });
  MAT.houseRoof = new THREE.MeshStandardMaterial({ color: 0x1E8A47, roughness: 0.5 });
  MAT.hotelBody = new THREE.MeshStandardMaterial({ color: 0xE8473B, roughness: 0.45 });
  MAT.hotelRoof = new THREE.MeshStandardMaterial({ color: 0xA9221A, roughness: 0.5 });
  MAT.window = new THREE.MeshStandardMaterial({ color: 0xFFE7A0, emissive: 0xFFC94D, emissiveIntensity: 0.55, roughness: 0.3 });
  MAT.door = new THREE.MeshStandardMaterial({ color: 0x5A3A22, roughness: 0.7 });
  MAT.chimney = new THREE.MeshStandardMaterial({ color: 0xB9B3A8, roughness: 0.8 });
  MAT.white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  MAT.ready = true;
  return MAT;
}

function prism(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

let houseProto = null;
let hotelProto = null;
function makeHouse() {
  if (houseProto) return houseProto.clone();
  const M = mats();
  const g = new THREE.Group();
  const bw = 0.15; const bh = 0.12; const bd = 0.14;
  g.add(box(bw, bh, bd, M.houseBody, 0, bh / 2, 0));
  const roof = new THREE.Mesh(prism(bw + 0.04, 0.085, bd + 0.03), M.houseRoof);
  roof.position.y = bh;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(0.026, 0.05, 0.026, M.chimney, 0.04, bh + 0.065, -0.02));
  g.add(box(0.034, 0.06, 0.004, M.door, 0, 0.03, bd / 2 + 0.002));
  g.add(box(0.03, 0.03, 0.004, M.window, -0.048, 0.07, bd / 2 + 0.002));
  g.add(box(0.03, 0.03, 0.004, M.window, 0.048, 0.07, bd / 2 + 0.002));
  houseProto = g;
  return g.clone();
}
function makeHotel() {
  if (hotelProto) return hotelProto.clone();
  const M = mats();
  const g = new THREE.Group();
  const bw = 0.34; const bh = 0.17; const bd = 0.16;
  g.add(box(bw, bh, bd, M.hotelBody, 0, bh / 2, 0));
  const roof = new THREE.Mesh(prism(bw + 0.04, 0.09, bd + 0.03), M.hotelRoof);
  roof.rotation.y = 0;
  roof.position.y = bh;
  roof.castShadow = true;
  g.add(roof);
  g.add(box(0.05, 0.075, 0.004, M.door, 0, 0.0375, bd / 2 + 0.002));
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      if (r === 0 && (c === 1 || c === 2)) continue;
      g.add(box(0.034, 0.032, 0.004, M.window, -0.12 + c * 0.08, 0.05 + r * 0.065, bd / 2 + 0.002));
    }
  }
  hotelProto = g;
  return g.clone();
}

function makePawn(color) {
  const pts = [
    [0, 0], [0.2, 0], [0.205, 0.035], [0.17, 0.06], [0.12, 0.085], [0.09, 0.12],
    [0.07, 0.24], [0.06, 0.3], [0.1, 0.32], [0.11, 0.345], [0.06, 0.36], [0, 0.36],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat);
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 32, 20), mat);
  head.position.y = 0.43;
  head.castShadow = true;
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(body, head);
  g.add(inner);
  g.userData = { inner, mat };
  return g;
}

function avatarTexture(t) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const draw = (img) => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.beginPath(); ctx.arc(128, 128, 124, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(128, 128, 112, 0, Math.PI * 2); ctx.fillStyle = t.color; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(128, 128, 98, 0, Math.PI * 2); ctx.clip();
    if (img) {
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 30, 30, 196, 196);
    } else {
      ctx.fillStyle = t.color; ctx.fillRect(0, 0, 256, 256);
      setFont(ctx, 900, 96, 'normal');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(initials(t.name), 128, 136);
    }
    ctx.restore();
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const p = photoOf(t.id);
  if (p) { const img = new Image(); img.onload = () => draw(img); img.src = p; draw(null); } else draw(null);
  return tex;
}

function plaqueTexture(t, rent, mortgaged) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = mortgaged ? '#9A9AB0' : t.color;
  ctx.fillRect(0, 0, 512, 128);
  if (mortgaged) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 14;
    for (let k = -4; k < 12; k++) { ctx.beginPath(); ctx.moveTo(k * 50, 128); ctx.lineTo(k * 50 + 128, 0); ctx.stroke(); }
  }
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,.25)');
  g.addColorStop(1, 'rgba(0,0,0,.15)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  setFont(ctx, 900, 70, 'normal');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowOffsetY = 3;
  ctx.fillText(mortgaged ? 'HIPOTECADA' : money(rent), 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function deckTexture(deck, count) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 720;
  const ctx = c.getContext('2d');
  const good = deck === 'good';
  const g = ctx.createLinearGradient(0, 0, 512, 720);
  g.addColorStop(0, good ? '#34C46E' : '#4A4F9E');
  g.addColorStop(1, good ? '#178A47' : '#262A66');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 720);
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = 12;
  roundRect(ctx, 30, 30, 452, 660, 30);
  ctx.stroke();
  ctx.save();
  roundRect(ctx, 30, 30, 452, 660, 30);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.lineWidth = 18;
  for (let k = -10; k < 20; k++) { ctx.beginPath(); ctx.moveTo(k * 60, 720); ctx.lineTo(k * 60 + 720, 0); ctx.stroke(); }
  ctx.restore();
  // símbol: sol o llamp
  ctx.save();
  ctx.translate(256, 300);
  ctx.fillStyle = '#FFD84D';
  ctx.strokeStyle = '#1C1A3A';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  if (good) {
    for (let k = 0; k < 12; k++) {
      ctx.save(); ctx.rotate((k * Math.PI) / 6);
      ctx.beginPath(); ctx.moveTo(-18, -95); ctx.lineTo(0, -150); ctx.lineTo(18, -95); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 92, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(30, -160); ctx.lineTo(-90, 20); ctx.lineTo(-5, 20); ctx.lineTo(-35, 160); ctx.lineTo(95, -30); ctx.lineTo(10, -30); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  setFont(ctx, 900, 74, 'condensed');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(good ? 'CARTES BONES' : 'CARTES DOLENTES', 256, 540);
  if (count !== undefined) {
    setFont(ctx, 700, 44, 'normal');
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(`queden ${count}`, 256, 615);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------- Escena ----------
let renderer; let scene; let camera; let boardMesh; let boardTex; let boardCanvas;
let container;
const pawns = [];
const plaques = {};
const houses = {};
const decks = {};
let hoverMesh; let raycaster; const pointer = new THREE.Vector2();
let displayPos = null;
const animating = new Set();
let handlers = {};
const camTarget = new THREE.Vector3(0, 0, 0.35);
const camFocus = { x: 0, z: 0, k: 0 };
let baseDist = 12;
const ELEV = THREE.MathUtils.degToRad(62);
let turnTeam = -1;
let lastTime = 0;

export function initScene(el, h) {
  container = el;
  handlers = h;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Tauler de joc');

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xEEF3FF, 0x3A3470, 1.1));
  const sun = new THREE.DirectionalLight(0xFFF4E2, 2.4);
  sun.position.set(-5, 11, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9AB0FF, 0.6);
  rim.position.set(6, 5, -6);
  scene.add(rim);

  // ombra a terra
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.38 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.42;
  ground.receiveShadow = true;
  scene.add(ground);

  raycaster = new THREE.Raycaster();
  hoverMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.22, depthWrite: false }));
  hoverMesh.rotation.x = -Math.PI / 2;
  hoverMesh.position.y = 0.004;
  hoverMesh.visible = false;
  scene.add(hoverMesh);

  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerleave', () => { hoverMesh.visible = false; el.style.cursor = ''; });
  el.addEventListener('click', onClick);

  new ResizeObserver(resize).observe(el);
  buildBoard();
  resize();
  requestAnimationFrame(loop);
}

export function buildBoard() {
  if (boardMesh) {
    scene.remove(boardMesh.parent);
    boardMesh.geometry.dispose();
    boardTex.dispose();
  }
  const l = L();
  const group = new THREE.Group();
  // base gruixuda amb vora arrodonida
  const shape = new THREE.Shape();
  const hb = l / 2 + 0.22;
  const rr = 0.35;
  shape.moveTo(-hb + rr, -hb);
  shape.lineTo(hb - rr, -hb); shape.quadraticCurveTo(hb, -hb, hb, -hb + rr);
  shape.lineTo(hb, hb - rr); shape.quadraticCurveTo(hb, hb, hb - rr, hb);
  shape.lineTo(-hb + rr, hb); shape.quadraticCurveTo(-hb, hb, -hb, hb - rr);
  shape.lineTo(-hb, -hb + rr); shape.quadraticCurveTo(-hb, -hb, -hb + rr, -hb);
  const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 4, curveSegments: 10 });
  baseGeo.rotateX(-Math.PI / 2);
  baseGeo.translate(0, -0.38, 0); // la cara de dalt queda sota el tauler (si no, parpelleja)
  const base = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x23214F, roughness: 0.4, metalness: 0.1 }));
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  boardCanvas = boardCanvas || document.createElement('canvas');
  boardCanvas.width = TEX; boardCanvas.height = TEX;
  drawBoard(boardCanvas);
  boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const top = new THREE.Mesh(new THREE.PlaneGeometry(l, l), new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.62, metalness: 0 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.0;
  top.receiveShadow = true;
  group.add(top);
  boardMesh = top;
  scene.add(group);

  // piles de cartes
  ['good', 'bad'].forEach((d, k) => {
    if (decks[d]) scene.remove(decks[d].group);
    const g = new THREE.Group();
    const side = new THREE.MeshStandardMaterial({ color: 0xF5F5FA, roughness: 0.8 });
    const topMat = new THREE.MeshStandardMaterial({ map: deckTexture(d), roughness: 0.5 });
    const stack = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 1.47), [side, side, topMat, side, side, side]);
    stack.position.y = 0.08;
    stack.castShadow = true;
    stack.receiveShadow = true;
    g.add(stack);
    g.position.set(k ? 1.35 : -1.35, 0, 0.95);
    g.rotation.y = k ? -0.14 : 0.12;
    g.userData = { deck: d, topMat };
    scene.add(g);
    decks[d] = { group: g, stack, topMat, count: -1 };
  });

  // peons
  pawns.forEach((p) => scene.remove(p));
  pawns.length = 0;
  Object.values(plaques).forEach((p) => scene.remove(p.mesh));
  Object.keys(plaques).forEach((k) => delete plaques[k]);
  Object.values(houses).forEach((list) => list.forEach((m) => scene.remove(m)));
  Object.keys(houses).forEach((k) => delete houses[k]);
  displayPos = null;
  avatarKeys.length = 0;
  refresh(false);
}

function fit() {
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  camera.aspect = w / h;
  const l = L() / 2 + 0.3;
  const pts = [];
  [-l, l].forEach((x) => [-l, l].forEach((z) => { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, -0.34, z)); }));
  pts.push(new THREE.Vector3(0, 1.1, -l));
  let lo = 4; let hi = 60;
  for (let k = 0; k < 30; k++) {
    const d = (lo + hi) / 2;
    placeCamera(d, 0, 0, 0);
    let ok = true;
    for (const p of pts) {
      const v = p.clone().project(camera);
      if (Math.abs(v.x) > 0.97 || Math.abs(v.y) > 0.95) { ok = false; break; }
    }
    if (ok) hi = d; else lo = d;
  }
  baseDist = hi;
  placeCamera(baseDist, camFocus.x, camFocus.z, camFocus.k);
}

function placeCamera(d, fx, fz, k) {
  const tx = camTarget.x + (fx - camTarget.x) * k * 0.35;
  const tz = camTarget.z + (fz - camTarget.z) * k * 0.35;
  const dist = d * (1 - k * 0.12);
  camera.position.set(tx, Math.sin(ELEV) * dist, tz + Math.cos(ELEV) * dist);
  camera.lookAt(tx, 0, tz);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  fit();
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  stepTweens(now);
  // el peó de qui li toca es balanceja
  pawns.forEach((p, k) => {
    const inner = p.userData.inner;
    if (k === turnTeam && !animating.has(k)) {
      inner.position.y = 0.05 + Math.abs(Math.sin(now / 380)) * 0.12;
      inner.rotation.y += dt * 1.4;
    } else if (!animating.has(k)) {
      inner.position.y += (0 - inner.position.y) * 0.2;
    }
  });
  placeCamera(baseDist, camFocus.x, camFocus.z, camFocus.k);
  renderer.render(scene, camera);
}

// ---------- Interacció ----------
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const dk = raycaster.intersectObjects([decks.good.stack, decks.bad.stack], false)[0];
  if (dk) return { deck: dk.object === decks.good.stack ? 'good' : 'bad' };
  const hit = raycaster.intersectObject(boardMesh, false)[0];
  if (!hit) return null;
  const { x, z } = hit.point;
  for (let i = 0; i < N(); i++) {
    const rc = rect(i);
    if (x >= rc.x0 && x <= rc.x1 && z >= rc.z0 && z <= rc.z1) return { sq: i, rect: rc };
  }
  return null;
}

function onPointerMove(e) {
  const p = pick(e);
  if (p && p.rect) {
    hoverMesh.visible = true;
    hoverMesh.scale.set(p.rect.x1 - p.rect.x0 - 0.04, p.rect.z1 - p.rect.z0 - 0.04, 1);
    const c = center(p.rect);
    hoverMesh.position.set(c.x, 0.004, c.z);
  } else hoverMesh.visible = false;
  container.style.cursor = p ? 'pointer' : '';
}

function onClick(e) {
  const p = pick(e);
  if (!p) return;
  if (p.deck) handlers.onDeck?.(p.deck);
  else handlers.onSquare?.(p.sq);
}

// ---------- Sincronització amb l'estat ----------
function spot(i, jailed) {
  const r = rect(i);
  const c = center(r);
  if (sq(i).type === 'jail') {
    const w = r.x1 - r.x0;
    return jailed ? { x: r.x1 - w * 0.33, z: r.z0 + w * 0.33 } : { x: r.x0 + w * 0.17, z: r.z1 - w * 0.17 };
  }
  // a les caselles, els peons es posen al mig (lluny de la franja de color)
  return c;
}

function pawnTarget(k, d = displayPos[k]) {
  const base = spot(d.pos, d.jail);
  const same = state.teams.map((x, j) => j).filter((j) => !team(j).bankrupt && displayPos[j] && displayPos[j].pos === d.pos && !!displayPos[j].jail === !!d.jail);
  const n = same.length;
  const idx = same.indexOf(k);
  let dx = 0; let dz = 0;
  const o = sq(d.pos).type === 'jail' && !d.jail ? 0.15 : 0.2;
  if (n === 2) dx = (idx ? 1 : -1) * o;
  else if (n >= 3) { dx = (idx % 2 ? 1 : -1) * o; dz = (idx < 2 ? -1 : 1) * o; }
  return new THREE.Vector3(base.x + dx, 0, base.z + dz);
}

const avatarKeys = [];
export function refresh(animateHouses = false) {
  if (!scene) return;
  if (!displayPos) {
    displayPos = {};
    state.teams.forEach((t, k) => { displayPos[k] = { pos: t.pos, jail: t.jail }; });
  }
  // peons
  state.teams.forEach((t, k) => {
    let p = pawns[k];
    if (!p) {
      p = makePawn(t.color);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthWrite: false }));
      sprite.scale.set(0.42, 0.42, 1);
      sprite.position.y = 0.85;
      sprite.renderOrder = 10;
      p.userData.inner.add(sprite);
      p.userData.sprite = sprite;
      scene.add(p);
      pawns[k] = p;
    }
    p.userData.mat.color.set(t.color);
    const key = `${t.color}|${t.name}|${photoOf(t.id).length}`;
    if (avatarKeys[k] !== key) {
      avatarKeys[k] = key;
      p.userData.sprite.material.map?.dispose();
      p.userData.sprite.material.map = avatarTexture(t);
      p.userData.sprite.material.needsUpdate = true;
    }
    p.visible = !t.bankrupt;
    if (!animating.has(k)) p.position.copy(pawnTarget(k));
  });
  turnTeam = state.turn;

  // plaques d'amo i cases
  for (let i = 0; i < N(); i++) {
    const o = state.owners[i];
    const r = rect(i);
    // placa
    const key = o ? `${o.team}|${team(o.team).color}|${rentFor(i)}|${o.mortgaged}|${rules().currency}` : null;
    if (plaques[i] && plaques[i].key !== key) {
      scene.remove(plaques[i].mesh);
      plaques[i].mesh.material.forEach?.((m) => m.map?.dispose());
      delete plaques[i];
    }
    if (o && !plaques[i]) {
      const side = new THREE.MeshStandardMaterial({ color: o.mortgaged ? 0x77778A : team(o.team).color, roughness: 0.4 });
      const topM = new THREE.MeshStandardMaterial({ map: plaqueTexture(team(o.team), rentFor(i), o.mortgaged), roughness: 0.35 });
      let w; let d; let x; let z;
      if (r.side === 'b') { w = W - 0.16; d = 0.2; x = (r.x0 + r.x1) / 2; z = r.z1 - 0.15; }
      else if (r.side === 't') { w = W - 0.16; d = 0.2; x = (r.x0 + r.x1) / 2; z = r.z0 + 0.15; }
      else if (r.side === 'l') { w = C - BAND - 0.2; d = 0.2; x = r.x0 + 0.08 + w / 2; z = r.z1 - 0.15; }
      else { w = C - BAND - 0.2; d = 0.2; x = r.x1 - 0.08 - w / 2; z = r.z1 - 0.15; }
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), [side, side, topM, side, side, side]);
      m.position.set(x, 0.025, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      plaques[i] = { mesh: m, key };
      if (animateHouses) {
        m.scale.set(0.2, 0.2, 0.2);
        m.position.y = 0.6;
        tween(520, (p) => { const s = 0.2 + 0.8 * p; m.scale.set(s, s, s); m.position.y = 0.025 + (1 - p) * 0.6; }, ease.back);
      }
    }
    // cases
    const want = o && sq(i).type === 'prop' ? o.houses : 0;
    const list = houses[i] || (houses[i] = []);
    const kind = want === 5 ? 'hotel' : 'house';
    const haveKind = list[0]?.userData.kind;
    const haveCount = haveKind === 'hotel' ? 5 : list.length;
    if (haveCount !== want || (list.length && haveKind !== kind)) {
      const old = list.splice(0);
      const n = want === 5 ? 1 : want;
      const placements = housePlacements(r, n);
      placements.forEach((pos, j) => {
        const m = kind === 'hotel' ? makeHotel() : makeHouse();
        m.userData.kind = kind;
        m.position.set(pos.x, 0, pos.z);
        m.rotation.y = pos.rot;
        scene.add(m);
        list.push(m);
        const isNew = animateHouses && (kind === 'hotel' || j >= old.length);
        if (isNew) {
          m.position.y = 1.6;
          tween(700, (p) => { m.position.y = (1 - p) * 1.6; }, ease.bounce);
        }
      });
      old.forEach((m) => scene.remove(m));
    }
  }
  // piles de cartes
  ['good', 'bad'].forEach((d) => {
    const n = state.decks[d].length;
    if (decks[d].count !== n) {
      decks[d].count = n;
      decks[d].topMat.map?.dispose();
      decks[d].topMat.map = deckTexture(d, n);
      decks[d].topMat.needsUpdate = true;
    }
  });
}

function housePlacements(r, n) {
  const out = [];
  if (!n) return out;
  const vertical = r.side === 'l' || r.side === 'r';
  let cx; let cz;
  if (r.side === 'b') { cz = r.z0 + BAND / 2; cx = (r.x0 + r.x1) / 2; }
  else if (r.side === 't') { cz = r.z1 - BAND / 2; cx = (r.x0 + r.x1) / 2; }
  else if (r.side === 'l') { cx = r.x1 - BAND / 2; cz = (r.z0 + r.z1) / 2; }
  else { cx = r.x0 + BAND / 2; cz = (r.z0 + r.z1) / 2; }
  const step = 0.215;
  for (let k = 0; k < n; k++) {
    const off = (k - (n - 1) / 2) * step;
    out.push(vertical ? { x: cx, z: cz + off, rot: 0 } : { x: cx + off, z: cz, rot: 0 });
  }
  if (n === 1 && vertical) out[0].rot = 0;
  return out;
}

export function syncDisplay() {
  if (!displayPos) return;
  state.teams.forEach((t, k) => { displayPos[k] = { pos: t.pos, jail: t.jail }; });
}

// ---------- Animacions ----------
export async function hop(k, toPos, jail, { jump = false, onStep } = {}) {
  const p = pawns[k];
  if (!p) return;
  animating.add(k);
  const from = p.position.clone();
  const prevSpot = { ...displayPos[k] };
  displayPos[k] = { pos: toPos, jail };
  const to = pawnTarget(k);
  const h = jump ? 2.4 : 0.6;
  const inner = p.userData.inner;
  inner.position.y = 0;
  camFocus.x = to.x; camFocus.z = to.z;
  await tween(jump ? 800 : 270, (t) => {
    p.position.lerpVectors(from, to, t);
    p.position.y = Math.sin(Math.PI * t) * h;
    inner.rotation.y = (jump ? 2 : 0.5) * Math.PI * t;
    const st = 1 + Math.sin(Math.PI * t) * 0.08;
    inner.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
  }, ease.inOut);
  onStep?.();
  // aterratge: es xafa una mica
  await tween(130, (t) => {
    const sq2 = Math.sin(Math.PI * t) * 0.18;
    inner.scale.set(1 + sq2 * 0.5, 1 - sq2, 1 + sq2 * 0.5);
  }, ease.linear);
  inner.scale.set(1, 1, 1);
  animating.delete(k);
  // recol·loquem els altres peons de la casella d'on surt i on arriba
  relayout([prevSpot.pos, toPos], k);
}

function relayout(positions, except) {
  pawns.forEach((p, j) => {
    if (j === except || animating.has(j) || !displayPos[j]) return;
    if (!positions.includes(displayPos[j].pos)) return;
    const from = p.position.clone();
    const to = pawnTarget(j);
    if (from.distanceTo(to) < 0.01) return;
    tween(220, (t) => p.position.lerpVectors(from, to, t), ease.out);
  });
}

export function focus(on) {
  const from = camFocus.k;
  const target = on ? 1 : 0;
  return tween(on ? 500 : 700, (t) => { camFocus.k = from + (target - from) * t; }, ease.inOut);
}

export function pulse(i, color = 0xFFD84D) {
  const r = rect(i);
  const c = center(r);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0 - 0.04, r.z1 - r.z0 - 0.04), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(c.x, 0.006, c.z);
  scene.add(m);
  tween(900, (t) => {
    m.material.opacity = 0.7 * (1 - t);
    const s = 1 + t * 0.12;
    m.scale.set(s, s, 1);
  }, ease.out).then(() => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
}

// una carta surt de la pila i vola cap a la càmera
export async function drawCard(deck) {
  const d = decks[deck];
  if (!d) return;
  const side = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const backM = new THREE.MeshStandardMaterial({ map: deckTexture(deck), roughness: 0.5 });
  const card = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.02, 1.47), [side, side, backM, side, side, side]);
  card.castShadow = true;
  const start = d.group.position.clone();
  start.y = 0.18;
  card.position.copy(start);
  card.rotation.y = d.group.rotation.y;
  scene.add(card);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const end = camera.position.clone().add(dir.multiplyScalar(3.2));
  await tween(220, (t) => { card.position.y = start.y + t * 0.5; }, ease.out);
  await tween(520, (t) => {
    card.position.lerpVectors(new THREE.Vector3(start.x, start.y + 0.5, start.z), end, t);
    card.rotation.x = t * (Math.PI / 2 - ELEV + Math.PI * 0.5) * 0.9;
    card.rotation.z = t * Math.PI;
    const s = 1 + t * 0.6;
    card.scale.set(s, s, s);
  }, ease.inOut);
  scene.remove(card);
  card.geometry.dispose();
  backM.map.dispose();
}

export function setTurn(k) { turnTeam = k; }
export const debugCanvas = () => boardCanvas;
export const isAnimating = () => animating.size > 0;
