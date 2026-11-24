// Tauler en 3D amb Three.js: tauler, peons, cases, piles de cartes i animacions.
import * as THREE from '../vendor/three.module.min.js';
import { state, sq, N, team, money, rentFor, rules } from './engine.js?v=1795554820';
import { photoOf, initials } from './util.js?v=1795554820';
import { deckName } from './data.js?v=1795554820';

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

// alçada que ocuparà un text amb fitText (sense dibuixar-lo)
function measureFit(ctx, text, maxW, maxH, { size = 64, min = 34, weight = 800, stretch = 'condensed', lh = 1.04, maxLines = 3 } = {}) {
  let s = size;
  let lines;
  for (; s >= min; s -= 2) {
    setFont(ctx, weight, s, stretch);
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.length * s * lh <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  return lines.length * s * lh;
}

function drawTrain(ctx, cx, cy, s) {
  // frontal d'un tren de rodalies, dibuixat
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 100, s / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // pantògraf
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-16, -52); ctx.lineTo(0, -66); ctx.lineTo(16, -52);
  ctx.moveTo(-22, -68); ctx.lineTo(22, -68);
  ctx.moveTo(0, -66); ctx.lineTo(0, -68);
  ctx.stroke();
  // carrosseria
  ctx.beginPath();
  ctx.moveTo(-44, 44);
  ctx.lineTo(-44, -18);
  ctx.quadraticCurveTo(-44, -52, -14, -54);
  ctx.lineTo(14, -54);
  ctx.quadraticCurveTo(44, -52, 44, -18);
  ctx.lineTo(44, 44);
  ctx.closePath();
  const body = ctx.createLinearGradient(-44, 0, 44, 0);
  body.addColorStop(0, '#E3E7F3');
  body.addColorStop(0.35, '#FFFFFF');
  body.addColorStop(1, '#C9CFE3');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // franja
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#E8473B';
  ctx.fillRect(-46, 6, 92, 12);
  ctx.fillStyle = '#FFB020';
  ctx.fillRect(-46, 18, 92, 4);
  ctx.restore();
  // parabrisa
  roundRect(ctx, -33, -44, 66, 38, 12);
  const glass = ctx.createLinearGradient(0, -44, 0, -6);
  glass.addColorStop(0, '#1C2756');
  glass.addColorStop(1, '#4C6FC4');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.moveTo(-26, -40); ctx.lineTo(-12, -40); ctx.lineTo(-24, -10); ctx.lineTo(-30, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath(); ctx.moveTo(-8, -40); ctx.lineTo(-2, -40); ctx.lineTo(-14, -10); ctx.lineTo(-20, -10); ctx.closePath(); ctx.fill();
  // fars amb resplendor
  [-26, 26].forEach((x) => {
    const g = ctx.createRadialGradient(x, 32, 2, x, 32, 22);
    g.addColorStop(0, 'rgba(255,240,170,.95)');
    g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, 32, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF6C8';
    ctx.beginPath(); ctx.arc(x, 32, 7, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
  });
  // indicador de destinació
  roundRect(ctx, -12, 26, 24, 12, 3);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = '#FFB020';
  ctx.fillRect(-8, 30, 16, 4);
  // para-xocs i rodes
  roundRect(ctx, -40, 44, 80, 9, 4);
  ctx.fillStyle = '#3A3F5C';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = INK;
  roundRect(ctx, -34, 53, 18, 8, 3); ctx.fill();
  roundRect(ctx, 16, 53, 18, 8, 3); ctx.fill();
  ctx.restore();
}

// cartell d'estació: rectangle blau amb vora blanca i el nom
function drawStationSign(ctx, cx, top, maxW, maxH, text, wide) {
  const padX = 22;
  const padY = 16;
  let s = 76;
  let lines;
  for (; s >= 30; s -= 2) {
    setFont(ctx, 850, s, 'condensed');
    lines = wrap(ctx, text, maxW - padX * 2);
    if (lines.length <= (wide ? 2 : 3) && lines.length * s * 1.04 + padY * 2 <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW - padX * 2)) break;
  }
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2);
  const h = lines.length * s * 1.04 + padY * 2;
  roundRect(ctx, cx - w / 2, top, w, h, 18);
  const g = ctx.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, '#3446A8');
  g.addColorStop(1, '#202C78');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  roundRect(ctx, cx - w / 2 - 5, top - 5, w + 10, h + 10, 22);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, k) => ctx.fillText(l, cx, top + padY + k * s * 1.04 + 2));
  return h;
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

let jailImg = null; // foto opcional per a dins la presó (p. ex. la cara d'un moni)

function drawJail(ctx, x, y, w, h, name) {
  ctx.fillStyle = '#FFF4E4';
  ctx.fillRect(x, y, w, h);
  // la cel·la ocupa la part interior (dalt a la dreta)
  const cw = w * 0.66;
  const cx = x + w - cw;
  const cy = y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx, cy, cw, cw);
  ctx.clip();
  if (jailImg) {
    const s = Math.min(jailImg.width, jailImg.height);
    ctx.drawImage(jailImg, (jailImg.width - s) / 2, (jailImg.height - s) / 2, s, s, cx, cy, cw, cw);
    ctx.fillStyle = 'rgba(20,20,50,.18)';
    ctx.fillRect(cx, cy, cw, cw);
  } else {
    const wall = ctx.createRadialGradient(cx + cw / 2, cy + cw * 0.35, 20, cx + cw / 2, cy + cw / 2, cw * 0.8);
    wall.addColorStop(0, '#5B6488');
    wall.addColorStop(1, '#262B4A');
    ctx.fillStyle = wall;
    ctx.fillRect(cx, cy, cw, cw);
  }
  // ombra dels barrots a terra
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let k = 1; k < 6; k++) ctx.fillRect(cx + (cw / 6) * k + 18, cy, 22, cw);
  ctx.restore();
  // barrots metàl·lics
  const bar = (bx) => {
    const bg = ctx.createLinearGradient(bx - 16, 0, bx + 16, 0);
    bg.addColorStop(0, '#4A4E60');
    bg.addColorStop(0.4, '#F2F4FA');
    bg.addColorStop(0.6, '#C9CDDA');
    bg.addColorStop(1, '#3E4152');
    ctx.fillStyle = bg;
    roundRect(ctx, bx - 16, cy - 10, 32, cw + 20, 16);
    ctx.fill();
  };
  for (let k = 1; k < 6; k++) bar(cx + (cw / 6) * k);
  // travesser horitzontal
  const tg = ctx.createLinearGradient(0, cy + cw * 0.3 - 16, 0, cy + cw * 0.3 + 16);
  tg.addColorStop(0, '#4A4E60'); tg.addColorStop(0.45, '#F2F4FA'); tg.addColorStop(1, '#3E4152');
  ctx.fillStyle = tg;
  ctx.fillRect(cx, cy + cw * 0.3 - 14, cw, 28);
  ctx.lineWidth = 12;
  ctx.strokeStyle = INK;
  ctx.strokeRect(cx + 6, cy - 6, cw, cw);
  // cartell
  setFont(ctx, 900, 92, 'expanded');
  const label = name.toUpperCase();
  const tw = ctx.measureText(label).width + 70;
  roundRect(ctx, cx + cw / 2 - tw / 2, cy + cw - 135, tw, 112, 22);
  ctx.fillStyle = '#FFB020';
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx + cw / 2, cy + cw - 76);
  // "només de visita", de cara a qui mira, a la franja de baix
  setFont(ctx, 850, 66, 'condensed');
  ctx.fillStyle = INK;
  ctx.fillText('NOMÉS DE VISITA', x + w / 2, y + cw + (h - cw) / 2 + 4);
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
  // el conjunt (sirena + text) va de −190 a +292: el centrem
  ctx.translate(0, -51);
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
  ctx.strokeText('Caupoli', 0, 18);
  ctx.lineWidth = 28;
  ctx.strokeStyle = '#FFFFFF';
  ctx.strokeText('Caupoli', 0, 0);
  const lg = ctx.createLinearGradient(0, -150, 0, 150);
  lg.addColorStop(0, '#FF6B5B');
  lg.addColorStop(1, '#D3261B');
  ctx.fillStyle = lg;
  ctx.fillText('Caupoli', 0, 0);
  // cinta
  ctx.translate(0, 205);
  setFont(ctx, 850, 76, 'semi-expanded');
  const rib = 'Pioners i Caravel·les';
  const rw = ctx.measureText(rib).width + 110;
  roundRect(ctx, -rw / 2, -58, rw, 116, 58);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = '#FFD84D';
  ctx.fillText(rib, 0, 4);
  ctx.restore();
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
      const wide = r.side === 'l' || r.side === 'r';
      const pad = 24;
      const priceH = 92;
      const cx = bx + bw / 2; // tot centrat a l'amplada de la casella (sense la franja)
      // a la part exterior hi va el preu (i la placa de l'amo, en 3D)
      const top = r.side === 't' ? by + priceH + pad * 0.5 : by + pad;
      const priceY = r.side === 't' ? by + pad : by + bh - priceH + 4;
      const room = bh - priceH - pad * 1.8;
      if (cell.type === 'prop') {
        const col = state.config.groups[cell.group]?.color || '#999';
        ctx.fillStyle = col;
        ctx.fillRect(...band);
        const sh = ctx.createLinearGradient(band[0], band[1], band[0] + (wide ? band[2] : 0), band[1] + (wide ? 0 : band[3]));
        sh.addColorStop(0, 'rgba(255,255,255,.28)');
        sh.addColorStop(1, 'rgba(0,0,0,.12)');
        ctx.fillStyle = sh;
        ctx.fillRect(...band);
        // el nom, centrat també en vertical dins l'espai que té
        const h = measureFit(ctx, cell.name.toUpperCase(), bw - pad * 2, room, { size: 88, maxLines: wide ? 2 : 4 });
        fitText(ctx, cell.name.toUpperCase(), cx, top + Math.max(0, (room - h) / 2), bw - pad * 2, room, { size: 88, min: 34, maxLines: wide ? 2 : 4 });
      } else if (cell.type === 'station') {
        // fons d'andana: cel clar i línia groga de seguretat
        const sky = ctx.createLinearGradient(bx, by, bx, by + bh);
        sky.addColorStop(0, '#EAF1FF');
        sky.addColorStop(1, '#FFFFFF');
        ctx.fillStyle = sky;
        ctx.fillRect(bx, by, bw, bh);
        drawRails(ctx, ...band, wide);
        ctx.fillStyle = '#FFC93C';
        if (r.side === 'b') ctx.fillRect(bx, by, bw, 10);
        else if (r.side === 't') ctx.fillRect(bx, by + bh - 10, bw, 10);
        else if (r.side === 'l') ctx.fillRect(bx + bw - 10, by, 10, bh);
        else ctx.fillRect(bx, by, 10, bh);
        const sh = drawStationSign(ctx, cx, top + 6, bw - pad * 2, room * (wide ? 0.48 : 0.42), cell.name.toUpperCase(), wide);
        const left = room - sh - 6;
        const trainSize = wide ? Math.min(170, left * 0.95) : Math.min(230, left * 0.85);
        drawTrain(ctx, cx, top + sh + 6 + left / 2 + trainSize * 0.04, trainSize);
      } else {
        fitText(ctx, cell.name.toUpperCase(), cx, top, bw - pad * 2, room, { size: 84 });
      }
      if (cell.price) {
        setFont(ctx, 800, 72, 'normal');
        ctx.fillStyle = '#5B5A7A';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(money(cell.price), cx, priceY);
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
  g.addColorStop(0, good ? '#34C46E' : '#5157B8');
  g.addColorStop(1, good ? '#178A47' : '#2A2F78');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 720);
  ctx.strokeStyle = 'rgba(255,255,255,.75)';
  ctx.lineWidth = 12;
  roundRect(ctx, 30, 30, 452, 660, 30);
  ctx.stroke();
  ctx.save();
  roundRect(ctx, 30, 30, 452, 660, 30);
  ctx.clip();
  // trama de nusos: cercles concèntrics a les cantonades
  ctx.strokeStyle = 'rgba(255,255,255,.13)';
  ctx.lineWidth = 10;
  [[30, 30], [482, 690]].forEach(([ox, oy]) => {
    for (let r = 60; r < 700; r += 46) { ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.stroke(); }
  });
  ctx.restore();
  // el nom del mall, gran i en dues línies
  const words = deckName(rules(), deck).toUpperCase().split(/\s+/);
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fs = 132;
  setFont(ctx, 900, fs, 'condensed');
  while (fs > 60 && lines.some((l) => ctx.measureText(l).width > 400)) { fs -= 4; setFont(ctx, 900, fs, 'condensed'); }
  ctx.lineJoin = 'round';
  lines.forEach((l, k) => {
    const yy = 330 + (k - (lines.length - 1) / 2) * fs * 0.98;
    ctx.lineWidth = 22;
    ctx.strokeStyle = '#1C1A3A';
    ctx.strokeText(l, 256, yy + 6);
    ctx.fillStyle = k === 0 ? '#FFD84D' : '#FFFFFF';
    ctx.fillText(l, 256, yy);
  });
  if (count !== undefined) {
    setFont(ctx, 700, 44, 'normal');
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(`queden ${count}`, 256, 610);
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
const camTarget = new THREE.Vector3(0, 0, 0.12);
const camFocus = { x: 0, z: 0, k: 0 }; // on vol anar la càmera
const camCur = { x: 0, z: 0, k: 0 }; // on és ara (s'hi acosta a poc a poc)
let baseDist = 12;
const ELEV = THREE.MathUtils.degToRad(58);
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
  // foto de la presó (opcional): es carrega i es torna a dibuixar el tauler
  const jp = photoOf('jail');
  if (jp && (!jailImg || jailImg.src !== jp)) {
    const img = new Image();
    img.onload = () => { jailImg = img; drawBoard(boardCanvas); boardTex.needsUpdate = true; };
    img.src = jp;
  } else if (!jp) jailImg = null;
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
  Object.keys(mortMarks).forEach((k) => { scene.remove(mortMarks[k]); delete mortMarks[k]; });
  displayPos = null;
  avatarKeys.length = 0;
  refresh(false);
}

function fit() {
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  camera.aspect = w / h;
  const l = L() / 2 + 0.24;
  const pts = [];
  [-l, l].forEach((x) => [-l, l].forEach((z) => { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, -0.38, z)); }));
  pts.push(new THREE.Vector3(0, 0.55, -l));
  let lo = 4; let hi = 60;
  for (let k = 0; k < 30; k++) {
    const d = (lo + hi) / 2;
    placeCamera(d, 0, 0, 0);
    let ok = true;
    for (const p of pts) {
      const v = p.clone().project(camera);
      if (Math.abs(v.x) > 0.99 || Math.abs(v.y) > 0.985) { ok = false; break; }
    }
    if (ok) hi = d; else lo = d;
  }
  baseDist = hi;
  placeCamera(baseDist, camCur.x, camCur.z, camCur.k);
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
  // la càmera segueix el punt d'interès amb suavitat (sense salts)
  const a = reduced() ? 1 : 1 - Math.exp(-dt * 2.6);
  camCur.x += (camFocus.x - camCur.x) * a;
  camCur.z += (camFocus.z - camCur.z) * a;
  camCur.k += (camFocus.k - camCur.k) * (reduced() ? 1 : 1 - Math.exp(-dt * 2.2));
  placeCamera(baseDist, camCur.x, camCur.z, camCur.k);
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
    // dins la cel·la o, si només és de visita, a la franja de l'esquerra
    return jailed ? { x: r.x1 - w * 0.33, z: r.z0 + w * 0.33 } : { x: r.x0 + w * 0.17, z: r.z0 + w * 0.36 };
  }
  // a les caselles, els peons es posen al mig (lluny de la franja de color)
  return c;
}

// On es col·loca cada peó: si n'hi ha diversos a la mateixa casella, en quadrícula dins la casella
function pawnTarget(k, d = displayPos[k]) {
  const same = state.teams.map((x, j) => j).filter((j) => !team(j).bankrupt && displayPos[j] && displayPos[j].pos === d.pos && !!displayPos[j].jail === !!d.jail);
  const n = same.length;
  const idx = Math.max(0, same.indexOf(k));
  const r = rect(d.pos);
  const w = r.x1 - r.x0;
  if (sq(d.pos).type === 'jail') {
    if (d.jail) {
      // dins la cel·la (2/3 de la cantonada, a dalt a la dreta), en quadrícula 2×2
      const cx = r.x1 - w * 0.33; const cz = r.z0 + w * 0.33;
      const o = n > 1 ? w * 0.13 : 0;
      return new THREE.Vector3(cx + (n > 1 ? (idx % 2 ? o : -o) : 0), 0, cz + (n > 2 ? (idx < 2 ? -o : o) : 0));
    }
    // de visita: en forma de L per la franja de l'esquerra i la de baix, sense sortir del tauler
    const slots = [
      [r.x0 + w * 0.17, r.z0 + w * 0.2], [r.x0 + w * 0.17, r.z0 + w * 0.48],
      [r.x0 + w * 0.17, r.z1 - w * 0.17], [r.x0 + w * 0.45, r.z1 - w * 0.17],
    ];
    const s = slots[Math.min(idx, 3)];
    return new THREE.Vector3(s[0], 0, s[1]);
  }
  // casella normal: al mig de la part sense franja
  const side = r.side;
  let x0 = r.x0; let x1 = r.x1; let z0 = r.z0; let z1 = r.z1;
  if (side === 'b') z0 += BAND; else if (side === 't') z1 -= BAND; else if (side === 'l') x1 -= BAND; else if (side === 'r') x0 += BAND;
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  if (n <= 1) return new THREE.Vector3(cx, 0, cz);
  const wide = (x1 - x0) >= (z1 - z0);
  const a = Math.min(0.24, ((wide ? x1 - x0 : z1 - z0) - 0.36) / 2); // separació al llarg
  const b = Math.min(0.2, ((wide ? z1 - z0 : x1 - x0) - 0.36) / 2); // separació a l'ample
  let u = 0; let v = 0;
  if (n === 2) u = idx ? a : -a;
  else { u = idx % 2 ? a : -a; v = idx < 2 ? -b : b; if (n === 3 && idx === 2) u = 0; }
  return wide ? new THREE.Vector3(cx + u, 0, cz + v) : new THREE.Vector3(cx + v, 0, cz + u);
}

const mortMarks = {};
let hatchTex = null;
function hatchTexture() {
  if (hatchTex) return hatchTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(28,26,58,.38)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 14;
  for (let k = -2; k < 4; k++) { ctx.beginPath(); ctx.moveTo(k * 48, 128); ctx.lineTo(k * 48 + 128, 0); ctx.stroke(); }
  hatchTex = new THREE.CanvasTexture(c);
  hatchTex.wrapS = hatchTex.wrapT = THREE.RepeatWrapping;
  hatchTex.repeat.set(3, 3);
  hatchTex.colorSpace = THREE.SRGBColorSpace;
  return hatchTex;
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
    // casella hipotecada: ratlles fosques per sobre
    if (o?.mortgaged && !mortMarks[i]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0 - 0.05, r.z1 - r.z0 - 0.05), new THREE.MeshBasicMaterial({ map: hatchTexture(), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      const c = center(r);
      m.position.set(c.x, 0.008, c.z);
      scene.add(m);
      mortMarks[i] = m;
    } else if (!o?.mortgaged && mortMarks[i]) {
      scene.remove(mortMarks[i]);
      mortMarks[i].geometry.dispose();
      mortMarks[i].material.dispose();
      delete mortMarks[i];
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
  camFocus.k = on ? 1 : 0;
  return Promise.resolve();
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

// cara d'una carta: capçalera del color del mall, el text i el resum de l'efecte
function cardFaceTexture(deck, text, foot) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 720;
  const ctx = c.getContext('2d');
  const good = deck === 'good';
  const col = good ? '#23A55A' : '#3A3F96';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 512, 720);
  ctx.lineWidth = 14;
  ctx.strokeStyle = col;
  roundRect(ctx, 16, 16, 480, 688, 28);
  ctx.stroke();
  roundRect(ctx, 16, 16, 480, 120, 28);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.fillRect(16, 90, 480, 46);
  setFont(ctx, 900, 58, 'normal');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(deckName(rules(), deck).toUpperCase(), 256, 80);
  // text centrat a la zona del mig
  let s = 54;
  let lines;
  for (; s >= 26; s -= 2) {
    setFont(ctx, 800, s, 'semi-condensed');
    lines = wrap(ctx, text || '', 420);
    if (lines.length * s * 1.18 <= 400) break;
  }
  ctx.fillStyle = INK;
  const top = 160 + (420 - lines.length * s * 1.18) / 2;
  lines.forEach((l, k) => ctx.fillText(l, 256, top + s * 0.6 + k * s * 1.18));
  if (foot) {
    roundRect(ctx, 50, 610, 412, 64, 18);
    ctx.fillStyle = '#EEF1FA';
    ctx.fill();
    setFont(ctx, 800, 30, 'normal');
    ctx.fillStyle = INK;
    ctx.fillText(foot, 256, 643);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let liveCard = null;
// La carta s'aixeca de la pila, es gira suaument i queda surant damunt del tauler
export async function drawCard(deck, card) {
  const d = decks[deck];
  if (!d) return;
  dropCard(true);
  const side = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const backM = new THREE.MeshStandardMaterial({ map: deckTexture(deck), roughness: 0.5 });
  const faceM = new THREE.MeshStandardMaterial({ map: cardFaceTexture(deck, card?.text, card?.foot), roughness: 0.5 });
  // la cara va a la part de sota (−y): quan la carta es gira, queda a la vista
  faceM.map.center.set(0.5, 0.5);
  faceM.map.rotation = Math.PI;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.02, 1.47), [side, side, backM, faceM, side, side]);
  mesh.castShadow = true;
  const pivot = new THREE.Group();
  pivot.add(mesh);
  const start = d.group.position.clone();
  start.y = 0.19;
  pivot.position.copy(start);
  pivot.rotation.y = d.group.rotation.y;
  scene.add(pivot);
  liveCard = { pivot, mesh, mats: [side, backM, faceM] };
  // 1) s'aixeca de la pila; 2) ve cap a tu mentre es gira de cap per avall a cap per amunt, sempre plana
  const lifted = new THREE.Vector3(start.x, start.y + 0.45, start.z);
  const toward = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0.6, 0.6), camera.position, 0.5);
  sfxHook?.('flip');
  await tween(320, (t) => { pivot.position.lerpVectors(start, lifted, t); }, ease.out);
  await tween(820, (t) => {
    pivot.position.lerpVectors(lifted, toward, t);
    pivot.position.y += Math.sin(Math.PI * t) * 0.35; // un petit arc
    pivot.rotation.y = d.group.rotation.y * (1 - t);
    mesh.rotation.z = Math.PI * t; // gir sobre el costat llarg, com quan gires una carta a la taula
    const sc = 1 + 0.35 * t;
    pivot.scale.set(sc, sc, sc);
  }, ease.inOut);
}

// la carta torna a la pila (o desapareix) quan ja s'ha llegit
export function dropCard(instant = false) {
  if (!liveCard) return;
  const { pivot, mesh, mats } = liveCard;
  liveCard = null;
  const done = () => { scene.remove(pivot); mesh.geometry.dispose(); mats.forEach((m) => { m.map?.dispose(); m.dispose(); }); };
  if (instant || reduced()) { done(); return; }
  const from = pivot.position.clone();
  const s0 = pivot.scale.x;
  tween(420, (t) => {
    pivot.position.set(from.x, from.y + t * 0.6, from.z - t * 0.4);
    const sc = s0 * (1 - t);
    pivot.scale.set(sc, sc, sc);
  }, ease.inOut).then(done);
}

let sfxHook = null;
export const setSfxHook = (fn) => { sfxHook = fn; };

export function setTurn(k) { turnTeam = k; }
export const debugCanvas = () => boardCanvas;
// per a proves amb la pestanya en segon pla (sense requestAnimationFrame)
export function renderOnce() { placeCamera(baseDist, camCur.x, camCur.z, camCur.k); renderer.render(scene, camera); }
export const isAnimating = () => animating.size > 0;
