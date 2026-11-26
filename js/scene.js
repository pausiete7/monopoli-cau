// Tauler en 3D amb Three.js: tauler, peons, cases, piles de cartes i animacions.
import * as THREE from '../vendor/three.module.min.js';
import { state, fx as fxQueue, sq, N, team, money, rentFor, rules } from './engine.js?v=1795731218';
import { photoOf, initials, randomFace } from './util.js?v=1795731218';
import { deckName } from './data.js?v=1795731218';

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

function drawGo(ctx, x, y, w, h, name = 'Sortida') {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#FFF7D6');
  g.addColorStop(1, '#FFE08A');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // el nom (p. ex. «CAU DE PIOS») en una o dues línies, tan gran com hi càpiga «SORTIDA»
  setFont(ctx, 900, 150, 'expanded');
  const maxW = ctx.measureText('SORTIDA').width;
  const text = name.toUpperCase();
  let lines = [text];
  const words = text.split(' ');
  if (ctx.measureText(text).width > maxW && words.length > 1) {
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const pair = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
      const wide = Math.max(...pair.map((l) => ctx.measureText(l).width));
      if (!best || wide < best.wide) best = { pair, wide };
    }
    lines = best.pair;
  }
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const size = Math.min(150, Math.floor(150 * maxW / widest), lines.length > 1 ? 120 : 150);
  setFont(ctx, 900, size, 'expanded');
  ctx.lineWidth = 18 * size / 150;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  const lh = size * 1.02;
  const y0 = -40 - (lines.length - 1) * lh / 2 - (lines.length > 1 ? 20 : 0);
  lines.forEach((l, k) => {
    ctx.strokeText(l, 0, y0 + k * lh);
    ctx.fillStyle = '#E8473B';
    ctx.fillText(l, 0, y0 + k * lh);
  });
  setFont(ctx, 800, 60, 'semi-condensed');
  ctx.fillStyle = INK;
  ctx.fillText(`Cobra ${money(rules().goSalary)}`, 0, 70 + (lines.length > 1 ? 30 : 0));
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
  } else {
    const wall = ctx.createRadialGradient(cx + cw / 2, cy + cw * 0.35, 20, cx + cw / 2, cy + cw / 2, cw * 0.8);
    wall.addColorStop(0, '#5B6488');
    wall.addColorStop(1, '#262B4A');
    ctx.fillStyle = wall;
    ctx.fillRect(cx, cy, cw, cw);
  }
  // ombra dels barrots a terra
  ctx.restore();
  // barrots metàl·lics molt fins: la foto de dins s'ha de veure bé
  const bar = (bx) => {
    const bg = ctx.createLinearGradient(bx - 4, 0, bx + 4, 0);
    bg.addColorStop(0, '#3E4152');
    bg.addColorStop(0.45, '#F2F4FA');
    bg.addColorStop(1, '#3E4152');
    ctx.fillStyle = bg;
    roundRect(ctx, bx - 4, cy - 4, 8, cw + 8, 4);
    ctx.fill();
  };
  for (let k = 1; k < 5; k++) bar(cx + (cw / 5) * k);
  // travesser horitzontal, també fi
  ctx.fillStyle = '#C9CDDA';
  ctx.fillRect(cx, cy + cw * 0.22 - 3, cw, 6);
  ctx.lineWidth = 12;
  ctx.strokeStyle = INK;
  ctx.strokeRect(cx + 6, cy - 6, cw, cw);
  // cartell
  // cartell més petit, a cavall de la vora de baix: no tapa la cara de la foto
  setFont(ctx, 900, 64, 'expanded');
  const label = name.toUpperCase();
  const tw = ctx.measureText(label).width + 50;
  roundRect(ctx, cx + cw / 2 - tw / 2, cy + cw - 38, tw, 76, 18);
  ctx.fillStyle = '#FFB020';
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx + cw / 2, cy + cw + 2);
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

// Pàrquing: senyal blau amb la P i el text en diagonal (les monedes del pot hi van a sobre en 3D)
function drawParking(ctx, x, y, w, h, name) {
  ctx.fillStyle = '#EAF1FF';
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(Math.PI / 4);
  // senyal
  ctx.save();
  ctx.translate(0, -120);
  roundRect(ctx, -120, -120, 240, 240, 36);
  const sg = ctx.createLinearGradient(0, -120, 0, 120);
  sg.addColorStop(0, '#3D7BFF');
  sg.addColorStop(1, '#1E4FCC');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#FFFFFF';
  roundRect(ctx, -104, -104, 208, 208, 26);
  ctx.stroke();
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  roundRect(ctx, -120, -120, 240, 240, 36);
  ctx.stroke();
  setFont(ctx, 900, 200, 'normal');
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P', 0, 12);
  ctx.restore();
  setFont(ctx, 900, 92, 'semi-expanded');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(name.toUpperCase(), 0, 90);
  setFont(ctx, 800, 50, 'condensed');
  ctx.fillStyle = '#5B5A7A';
  ctx.fillText(rules().parkingPot ? "S'emporta el pot de multes" : 'Descans', 0, 165);
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

let centerImg = null; // foto opcional per al centre del tauler (només en aquest navegador)

function drawCenter(ctx, x, y, w, h) {
  if (centerImg) {
    // la foto omple el centre (retallada perquè hi càpiga) i el logotip queda a sobre
    const ir = centerImg.width / centerImg.height;
    let sw = centerImg.width; let sh = centerImg.height; let sx = 0; let sy = 0;
    if (ir > w / h) { sw = centerImg.height * (w / h); sx = (centerImg.width - sw) / 2; } else { sh = centerImg.width / (w / h); sy = (centerImg.height - sh) / 2; }
    ctx.drawImage(centerImg, sx, sy, sw, sh, x, y, w, h);
    // una mica de llum a dalt perquè el logotip es llegeixi bé sobre qualsevol foto
    const fade = ctx.createLinearGradient(0, y, 0, y + h * 0.42);
    fade.addColorStop(0, 'rgba(255,255,255,.55)');
    fade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(x, y, w, h * 0.42);
    drawLogo(ctx, x, y, w, h);
    return;
  }
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
  drawLogo(ctx, x, y, w, h);
}

function drawLogo(ctx, x, y, w, h) {
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
      if (cell.type === 'go') drawGo(ctx, x, y, w, h, cell.name);
      else if (cell.type === 'jail') drawJail(ctx, x, y, w, h, cell.name);
      else if (cell.type === 'tax') drawTax(ctx, x, y, w, h, cell);
      else if (cell.type === 'gotojail') drawGoToJail(ctx, x, y, w, h, cell.name);
      else if (cell.type === 'parking') drawParking(ctx, x, y, w, h, cell.name);
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
  g.userData = { inner, mat, kind: 'peo' };
  return g;
}

// ---------- Fitxes temàtiques (cada equip tria la seva) ----------
// Totes tenen una peana del color de l'equip; la figura també porta el color on té sentit.
const tokMats = {};
const tokMat = (key, opts) => (tokMats[key] = tokMats[key] || new THREE.MeshStandardMaterial(opts));
function makeToken(kind, color) {
  if (!kind || kind === 'peo') return makePawn(color);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.05 });
  const dark = tokMat('dark', { color: 0x2A2440, roughness: 0.6 });
  const metal = tokMat('metal', { color: 0xC9CDDA, metalness: 0.85, roughness: 0.3 });
  const gold = tokMat('gold', { color: 0xFFC83D, metalness: 0.8, roughness: 0.3 });
  const wood = tokMat('wood', { color: 0x8B5A2B, roughness: 0.8 });
  const white = tokMat('white', { color: 0xF7F7FB, roughness: 0.5 });
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const add = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.castShadow = true;
    inner.add(o);
    return o;
  };
  // peana
  add(new THREE.CylinderGeometry(0.2, 0.215, 0.06, 40), mat, 0, 0.03);
  add(new THREE.TorusGeometry(0.2, 0.012, 8, 40), gold, 0, 0.062, 0, Math.PI / 2);
  const flames = [];
  if (kind === 'tenda') {
    const s = new THREE.Shape();
    s.moveTo(-0.19, 0); s.lineTo(0.19, 0); s.lineTo(0, 0.32); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
    geo.translate(0, 0, -0.15);
    add(geo, mat, 0, 0.06);
    const d = new THREE.Shape();
    d.moveTo(-0.07, 0); d.lineTo(0.07, 0); d.lineTo(0, 0.16); d.closePath();
    add(new THREE.ShapeGeometry(d), dark, 0, 0.061, 0.152);
    add(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), metal, 0, 0.44);
    const f = new THREE.Shape();
    f.moveTo(0, 0); f.lineTo(0.1, -0.03); f.lineTo(0, -0.06); f.closePath();
    add(new THREE.ShapeGeometry(f), gold, 0.004, 0.52).material.side = THREE.DoubleSide;
  } else if (kind === 'cantimplora') {
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 40), mat, 0, 0.24, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(0.15, 0.022, 10, 40), dark, 0, 0.24);
    add(new THREE.CircleGeometry(0.1, 32), tokMat('shine', { color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.2 }), 0, 0.24, 0.052);
    add(new THREE.CylinderGeometry(0.035, 0.045, 0.07, 16), metal, 0, 0.42);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.045, 16), dark, 0, 0.47);
    add(new THREE.TorusGeometry(0.17, 0.012, 6, 30, Math.PI * 0.9), wood, 0, 0.26, -0.03, 0, 0, Math.PI * 0.05);
  } else if (kind === 'fogonet') {
    // fogonet de càmping: bombona del color de l'equip, cremador i flama blava
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 32), mat, 0, 0.145);
    add(new THREE.CylinderGeometry(0.1125, 0.1125, 0.05, 32), white, 0, 0.15);
    const dome = add(new THREE.SphereGeometry(0.11, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, 0.23);
    dome.scale.y = 0.35;
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 14), metal, 0, 0.285);
    add(new THREE.CylinderGeometry(0.06, 0.045, 0.035, 20), metal, 0, 0.32);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.1, 0.012, 0.012), metal, Math.cos(a) * 0.07, 0.345, Math.sin(a) * 0.07, 0, -a, 0);
    }
    const blue = tokMat('blueflame', { color: 0x7FB8FF, emissive: 0x2F7BFF, emissiveIntensity: 1.3, roughness: 0.3 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      flames.push(add(new THREE.ConeGeometry(0.014, 0.06, 8), blue, Math.cos(a) * 0.04, 0.365, Math.sin(a) * 0.04));
    }
  } else if (kind === 'bota') {
    add(new THREE.BoxGeometry(0.13, 0.25, 0.14), mat, -0.04, 0.22, 0);
    add(new THREE.BoxGeometry(0.24, 0.1, 0.15), mat, 0.03, 0.12, 0);
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.15, 20), mat, 0.15, 0.12, 0, Math.PI / 2);
    add(new THREE.BoxGeometry(0.33, 0.035, 0.17), dark, 0.035, 0.078, 0);
    add(new THREE.BoxGeometry(0.15, 0.045, 0.16), dark, -0.04, 0.355, 0);
    for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.008, 0.012, 0.1), white, 0.03 - k * 0.025, 0.2 + k * 0.045, 0.072, 0, Math.PI / 2, 0);
    inner.children.slice(2).forEach((o) => { o.rotation.y -= 0.6; o.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.6); });
  } else if (kind === 'frontal') {
    // llanterna frontal deixada a terra: cinta elàstica del color de l'equip i el llum encès
    add(new THREE.TorusGeometry(0.13, 0.026, 10, 44), mat, 0, 0.14, -0.02, Math.PI / 2 - 0.35);
    add(new THREE.TorusGeometry(0.11, 0.02, 8, 30, Math.PI), mat, 0, 0.16, -0.06, 0.25, 0, 0);
    add(new THREE.BoxGeometry(0.15, 0.1, 0.07), dark, 0, 0.2, 0.12, -0.3);
    add(new THREE.BoxGeometry(0.155, 0.02, 0.075), mat, 0, 0.26, 0.105, -0.3);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 20), tokMat('lens', { color: 0xFFF6D6, emissive: 0xFFE9A0, emissiveIntensity: 1.4, roughness: 0.2 }), 0, 0.205, 0.158, Math.PI / 2 - 0.3);
  } else if (kind === 'fular') {
    // fular escolta estès: triangle del color de l'equip amb vora blanca, enrotllat a dalt i amb l'anella
    const tri = (w, top, bottom, m, z) => {
      const s = new THREE.Shape();
      s.moveTo(-w, top); s.lineTo(w, top); s.lineTo(0, bottom); s.closePath();
      add(new THREE.ShapeGeometry(s), m, 0, 0, z).material.side = THREE.DoubleSide;
    };
    tri(0.22, 0.47, 0.07, white, -0.004);
    tri(0.19, 0.455, 0.115, mat, 0);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 16), mat, 0, 0.47, 0.01, 0, 0, Math.PI / 2);
    add(new THREE.TorusGeometry(0.04, 0.016, 10, 22), wood, 0, 0.36, 0.025);
    [-1, 1].forEach((sgn) => add(new THREE.BoxGeometry(0.05, 0.13, 0.016), mat, sgn * 0.03, 0.27, 0.02, 0, 0, sgn * 0.18));
  } else if (kind === 'foguera') {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const log = add(new THREE.CylinderGeometry(0.028, 0.03, 0.32, 10), wood, 0, 0.12, 0, 0, a, 1.1);
      log.rotation.order = 'YXZ';
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      add(new THREE.DodecahedronGeometry(0.035, 0), tokMat('stone', { color: 0x9A96A8, roughness: 0.9 }), Math.cos(a) * 0.16, 0.085, Math.sin(a) * 0.16, a, a * 2, 0);
    }
    flames.push(add(new THREE.ConeGeometry(0.085, 0.27, 16), tokMat('flame', { color: 0xFF7A1A, emissive: 0xFF5A00, emissiveIntensity: 1, roughness: 0.4 }), 0, 0.27));
    flames.push(add(new THREE.ConeGeometry(0.05, 0.17, 14), tokMat('flame2', { color: 0xFFE066, emissive: 0xFFC400, emissiveIntensity: 1.2, roughness: 0.4 }), 0, 0.23, 0.02));
  }
  g.userData = { inner, mat, kind, flames };
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

// foto de l'equip carregada (per a les plaques); quan acaba de carregar, es refan les plaques
const plaqueImgs = {};
function teamImg(t) {
  const src = photoOf(t.id);
  if (!src) return null;
  const have = plaqueImgs[t.id];
  if (have && have.src === src) return have.complete && have.naturalWidth ? have : null;
  const img = new Image();
  img.onload = () => {
    Object.values(plaques).forEach((p) => { p.key += '*'; });
    if (scene) refresh(false);
  };
  img.src = src;
  plaqueImgs[t.id] = img;
  return null;
}
function plaqueTexture(t, rent, mortgaged, aspect = 4) {
  const c = document.createElement('canvas');
  const PW = Math.round(128 * aspect);
  c.width = PW; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = mortgaged ? '#9A9AB0' : t.color;
  ctx.fillRect(0, 0, PW, 128);
  if (mortgaged) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 14;
    for (let k = -4; k < PW / 50 + 4; k++) { ctx.beginPath(); ctx.moveTo(k * 50, 128); ctx.lineTo(k * 50 + 128, 0); ctx.stroke(); }
  }
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,.25)');
  g.addColorStop(1, 'rgba(0,0,0,.15)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PW, 128);
  // retrat rodó de l'equip a l'esquerra (foto o inicials)
  const cx = 66; const cy = 64; const r = 48;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const img = teamImg(t);
  if (mortgaged) ctx.filter = 'grayscale(1)';
  if (img) {
    ctx.fillStyle = t.color;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, cx - r, cy - r, 2 * r, 2 * r);
  } else {
    ctx.fillStyle = mortgaged ? '#7A7A90' : t.color;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    setFont(ctx, 900, 44, 'normal');
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(t.name), cx, cy + 3);
  }
  ctx.restore();
  ctx.filter = 'none';
  // lloguer (o HIPOTECADA) al lloc que queda
  const label = mortgaged ? 'HIPOTECADA' : money(rent);
  const left = cx + r + 14;
  const room = PW - left - 16;
  let fs = 70;
  setFont(ctx, 900, fs, 'normal');
  while (ctx.measureText(label).width > room && fs > 30) { fs -= 4; setFont(ctx, 900, fs, 'normal'); }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowOffsetY = 3;
  ctx.fillText(label, left + room / 2, 68);
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

  // halo de llum a terra sota la fitxa de l'equip que juga
  halo = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.4, 56), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2;
  halo.renderOrder = 2;
  scene.add(halo);
  haloFill = new THREE.Mesh(new THREE.CircleGeometry(0.24, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
  haloFill.rotation.x = -Math.PI / 2;
  scene.add(haloFill);

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
  // foto del centre del tauler (opcional)
  const cp = photoOf('center');
  if (cp && (!centerImg || centerImg.src !== cp)) {
    const img = new Image();
    img.onload = () => { centerImg = img; drawBoard(boardCanvas); boardTex.needsUpdate = true; placeDecks(); };
    img.src = cp;
  } else if (!cp) centerImg = null;
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
    g.rotation.y = k ? -0.14 : 0.12;
    g.userData = { deck: d, topMat };
    scene.add(g);
    decks[d] = { group: g, stack, topMat, count: -1 };
  });
  placeDecks();

  // peons
  pawns.forEach((p) => scene.remove(p));
  Object.keys(cages).forEach((k) => { scene.remove(cages[k]); delete cages[k]; });
  if (potGroup) { scene.remove(potGroup); potGroup = null; }
  potKey = '';
  pawns.length = 0;
  Object.values(plaques).forEach((p) => scene.remove(p.mesh));
  Object.keys(plaques).forEach((k) => delete plaques[k]);
  Object.values(houses).forEach((list) => list.forEach((m) => scene.remove(m)));
  Object.keys(houses).forEach((k) => delete houses[k]);
  Object.keys(mortMarks).forEach((k) => { scene.remove(mortMarks[k]); delete mortMarks[k]; });
  Object.keys(flags).forEach((k) => { scene.remove(flags[k].group); delete flags[k]; });
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
  // el ventall de bitllets del pot surt per darrere del tauler: també ha de cabre
  if (state.config && parkingIndex() >= 0 && rules().parkingPot) pts.push(...potBounds());
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

export const debugFit = () => { fit(); return baseDist; };
// només per a proves: renderitza des d'una càmera propera i torna la imatge
export function debugShot(px, py, pz, tx, ty, tz, w = 900, h = 520) {
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  cam.position.set(px, py, pz);
  cam.lookAt(tx, ty, tz);
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  renderer.setRenderTarget(null);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const id = c.getContext('2d').createImageData(w, h);
  for (let y = 0; y < h; y++) id.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  c.getContext('2d').putImageData(id, 0, 0);
  return c.toDataURL();
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
    if (k === crownTeam && !animating.has(k) && !dying.has(k)) {
      // el guanyador sura i gira amb la corona
      inner.position.y = 0.42 + Math.sin(now / 500) * 0.07;
      inner.rotation.y += dt * 1.1;
    } else if (k === turnTeam && !animating.has(k)) {
      inner.position.y = 0.05 + Math.abs(Math.sin(now / 380)) * 0.12;
      inner.rotation.y += dt * 1.4;
    } else if (!animating.has(k)) {
      inner.position.y += (0 - inner.position.y) * 0.2;
      // quan no li toca, la fitxa torna a mirar cap a la càmera
      const rest = Math.round(inner.rotation.y / (Math.PI * 2)) * Math.PI * 2;
      inner.rotation.y += (rest - inner.rotation.y) * 0.08;
    }
    // el foc de la foguera balla
    p.userData.flames?.forEach((f, j) => {
      const s = 1 + Math.sin(now / (90 + j * 37) + k) * 0.12 + Math.sin(now / 53 + j) * 0.05;
      f.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    });
  });
  updateHalo(now);
  if (!reduced()) waveFlags(now);
  // les gàbies segueixen la seva fitxa
  Object.entries(cages).forEach(([k, g]) => { const p = pawns[k]; if (p) { g.position.x = p.position.x; g.position.z = p.position.z; } });
  // la càmera segueix el punt d'interès amb suavitat (sense salts)
  const a = reduced() ? 1 : 1 - Math.exp(-dt * 2.6);
  camCur.x += (camFocus.x - camCur.x) * a;
  camCur.z += (camFocus.z - camCur.z) * a;
  camCur.k += (camFocus.k - camCur.k) * (reduced() ? 1 : 1 - Math.exp(-dt * 2.2));
  placeCamera(baseDist, camCur.x, camCur.z, camCur.k);
  if (now < shakeUntil) {
    const f = (shakeUntil - now) / 600;
    camera.position.x += Math.sin(now / 23) * shakeAmp * f;
    camera.position.y += Math.cos(now / 31) * shakeAmp * f;
  }
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
// equips que fan fallida i encara no s'ha vist l'animació: la seva fitxa i les plaques es queden fins aleshores
const dying = new Set();
const heldTeams = () => new Set([...dying, ...fxQueue.filter((e) => e.type === 'bankrupt').map((e) => e.team)]);
export function refresh(animateHouses = false) {
  if (!scene) return;
  const held = heldTeams();
  if (!displayPos) {
    displayPos = {};
    state.teams.forEach((t, k) => { displayPos[k] = { pos: t.pos, jail: t.jail }; });
  }
  // peons
  state.teams.forEach((t, k) => {
    let p = pawns[k];
    // si l'equip ha canviat de fitxa, es fa de nou
    if (p && p.userData.kind !== (t.token || 'peo')) {
      scene.remove(p);
      p = null;
      avatarKeys[k] = '';
    }
    if (!p) {
      p = makeToken(t.token, t.color);
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
    p.visible = !t.bankrupt || held.has(k);
    if (!animating.has(k) && !dying.has(k)) p.position.copy(pawnTarget(k));
  });
  turnTeam = state.turn;
  syncCrown();
  syncCages();
  syncPot(animateHouses || potAnimNext);
  potAnimNext = false;

  // plaques d'amo i cases
  for (let i = 0; i < N(); i++) {
    const o = state.owners[i];
    const r = rect(i);
    // propietat d'un equip que fa fallida: la placa i les cases esperen l'animació
    if (!o && plaques[i] && held.has(Number(plaques[i].key.split('|')[0]))) continue;
    // placa
    const key = o ? `${o.team}|${team(o.team).color}|${team(o.team).name}|${photoOf(team(o.team).id).length}|${rentFor(i)}|${o.mortgaged}|${rules().currency}` : null;
    if (plaques[i] && plaques[i].key !== key) {
      scene.remove(plaques[i].mesh);
      plaques[i].mesh.material.forEach?.((m) => m.map?.dispose());
      delete plaques[i];
    }
    if (o && !plaques[i]) {
      const side = new THREE.MeshStandardMaterial({ color: o.mortgaged ? 0x77778A : team(o.team).color, roughness: 0.4 });
      let w; let d; let x; let z;
      if (r.side === 'b') { w = W - 0.16; d = 0.25; x = (r.x0 + r.x1) / 2; z = r.z1 - 0.17; }
      else if (r.side === 't') { w = W - 0.16; d = 0.25; x = (r.x0 + r.x1) / 2; z = r.z0 + 0.17; }
      else if (r.side === 'l') { w = C - BAND - 0.2; d = 0.25; x = r.x0 + 0.08 + w / 2; z = r.z1 - 0.17; }
      else { w = C - BAND - 0.2; d = 0.25; x = r.x1 - 0.08 - w / 2; z = r.z1 - 0.17; }
      const topM = new THREE.MeshStandardMaterial({ map: plaqueTexture(team(o.team), rentFor(i), o.mortgaged, w / d), roughness: 0.35 });
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
      const toHotel = animateHouses && kind === 'hotel' && haveKind === 'house' && old.length === 4 && !reduced();
      placements.forEach((pos, j) => {
        const m = kind === 'hotel' ? makeHotel() : makeHouse();
        m.userData.kind = kind;
        m.position.set(pos.x, 0, pos.z);
        m.rotation.y = pos.rot;
        scene.add(m);
        list.push(m);
        if (toHotel) {
          // les 4 cases s'ajunten i surt l'hotel amb un «pop»
          m.scale.set(0.001, 0.001, 0.001);
          setTimeout(() => {
            tween(520, (p) => { const s = ease.back(p); m.scale.set(s, s, s); }, ease.linear);
            dustPuff(pos.x, pos.z, 14, 0.5);
            sparkle(pos.x, pos.z);
            sfxHook?.('hotel');
          }, 420);
          return;
        }
        const isNew = animateHouses && (kind === 'hotel' || j >= old.length);
        if (isNew) {
          m.position.y = 1.6;
          tween(700, (p) => { m.position.y = (1 - p) * 1.6; }, ease.bounce);
          // quan toca a terra (primer bot), núvol de pols
          setTimeout(() => { dustPuff(pos.x, pos.z); sfxHook?.('poof'); }, reduced() ? 0 : 260);
        }
      });
      if (toHotel) {
        const c = old.reduce((acc, m) => ({ x: acc.x + m.position.x / 4, z: acc.z + m.position.z / 4 }), { x: 0, z: 0 });
        old.forEach((m) => {
          const from = m.position.clone();
          tween(420, (p) => {
            m.position.x = from.x + (c.x - from.x) * p;
            m.position.z = from.z + (c.z - from.z) * p;
            m.position.y = Math.sin(Math.PI * p) * 0.25;
            const s = 1 - p * 0.95;
            m.scale.set(s, s, s);
          }, ease.inOut).then(() => scene.remove(m));
        });
      } else old.forEach((m) => scene.remove(m));
    }
  }
  syncFlags(animateHouses);
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

// ---------- Banderes de grup complet (E3) ----------
// Quan un equip té totes les propietats d'un color, s'hi planta un pal com el del cau: tronc de
// fusta una mica tort, munt de pedres a la base, una corda amb banderetes de verbena i la bandera
// de l'equip a dalt. Va al marc de fora del tauler, entre les caselles del grup: no xoca amb els
// malls ni amb les cartes.
const flags = {};
const FLAG_S = 1.25;
const FLAG_W = 0.3;
function flagTexture(t) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 170;
  const g = c.getContext('2d');
  g.fillStyle = t.color;
  g.fillRect(0, 0, 256, 170);
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.fillRect(0, 132, 256, 14);
  setFont(g, 900, 80, 'normal');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(0,0,0,.3)';
  g.shadowOffsetY = 3;
  g.fillText(initials(t.name), 128, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const lighten = (hex, k) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k);
function makeFlag(t) {
  const g = new THREE.Group();
  const wood = tokMat('pole', { color: 0xA9875F, roughness: 0.9 });
  const stone = tokMat('stone', { color: 0x9A96A8, roughness: 0.9 });
  // tronc
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 1.08, 9), wood);
  pole.position.y = 0.54;
  pole.rotation.z = -0.035;
  pole.castShadow = true;
  g.add(pole);
  // nusos de la fusta
  [0.3, 0.62, 0.85].forEach((y, j) => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), wood);
    n.position.set(0.012 - y * 0.035 + (j % 2 ? 0.01 : -0.012), y, 0.01);
    n.scale.set(1, 0.6, 1);
    g.add(n);
  });
  // munt de pedres
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.3;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03 + (k % 3) * 0.008, 0), stone);
    st.position.set(Math.cos(a) * 0.06, 0.02 + (k % 2) * 0.02, Math.sin(a) * 0.06);
    st.rotation.set(a, a * 2, 0);
    st.castShadow = true;
    g.add(st);
  }
  // el conjunt que s'hissa: corda, banderetes i bandera
  const rig = new THREE.Group();
  g.add(rig);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.95, 4), tokMat('rope', { color: 0xF2EBDC, roughness: 1 }));
  rope.position.set(0.034, 0.56, 0);
  rig.add(rope);
  const geo = new THREE.PlaneGeometry(FLAG_W, 0.2, 14, 4);
  geo.translate(FLAG_W / 2, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTexture(t), side: THREE.DoubleSide, roughness: 0.75 }));
  cloth.castShadow = true;
  cloth.position.set(0.034, 0.93, 0);
  rig.add(cloth);
  // banderetes de verbena penjades a la corda
  const pennants = [];
  const cols = [t.color, 0xFFC83D, lighten(t.color, 0.45), 0xE8473B, t.color];
  cols.forEach((col, j) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.045); s.lineTo(0.13, 0); s.lineTo(0, -0.045); s.closePath();
    const p = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 }));
    p.position.set(0.034, 0.76 - j * 0.12, 0);
    p.castShadow = true;
    rig.add(p);
    pennants.push(p);
  });
  g.userData = { cloth, rig, pennants, base: Float32Array.from(geo.attributes.position.array), phase: Math.random() * 6 };
  return g;
}
function groupsOf() {
  const out = {};
  state.config.board.forEach((s, i) => { if (s.type === 'prop') (out[s.group] = out[s.group] || []).push(i); });
  return out;
}
// al marc del tauler, a la ratlla entre les caselles del grup
function flagSpot(list) {
  const h = L() / 2 + 0.11;
  const cs = list.map((i) => center(rect(i)));
  const mx = cs.reduce((a, c) => a + c.x, 0) / cs.length;
  const mz = cs.reduce((a, c) => a + c.z, 0) / cs.length;
  const side = rect(list[0]).side;
  if (side === 'b') return { x: mx, z: h };
  if (side === 't') return { x: mx, z: -h };
  if (side === 'l') return { x: -h, z: mz };
  return { x: h, z: mz };
}
function syncFlags(animate) {
  const gs = groupsOf();
  Object.entries(gs).forEach(([gk, list]) => {
    const o0 = state.owners[list[0]];
    const full = o0 && !team(o0.team).bankrupt && list.every((i) => state.owners[i] && state.owners[i].team === o0.team);
    const key = full ? `${o0.team}|${team(o0.team).color}|${team(o0.team).name}` : null;
    const cur = flags[gk];
    if (cur && cur.key !== key) {
      const old = cur.group;
      delete flags[gk];
      if (animate && !reduced()) {
        tween(400, (p) => { old.scale.setScalar(FLAG_S * (1 - p)); }, ease.inOut).then(() => scene.remove(old));
      } else scene.remove(old);
    }
    if (key && !flags[gk]) {
      const t = team(o0.team);
      const f = makeFlag(t);
      const s = flagSpot(list);
      f.position.set(s.x, -0.04, s.z);
      f.scale.setScalar(FLAG_S);
      scene.add(f);
      flags[gk] = { group: f, key };
      if (animate && !reduced()) {
        // el pal surt i les banderes s'hissen corda amunt, amb espurnes
        const rig = f.userData.rig;
        f.scale.setScalar(0.001);
        rig.scale.set(1, 0.001, 1);
        tween(320, (p) => { f.scale.setScalar(FLAG_S * ease.back(p)); }, ease.linear).then(() => {
          tween(1000, (p) => { rig.scale.set(1, Math.max(0.001, p), 1); rig.position.y = (1 - p) * 0.9; }, ease.out);
          sfxHook?.('good');
          setTimeout(() => sparkle(s.x, s.z, 22, 1.2), 800);
        });
      }
    }
  });
}
function waveFlags(now) {
  Object.values(flags).forEach(({ group }) => {
    const { cloth, base, phase, pennants } = group.userData;
    const pos = cloth.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = base[v * 3];
      const k = x / FLAG_W;
      pos.array[v * 3 + 2] = Math.sin(x * 18 - now / 170 + phase) * 0.03 * k;
      pos.array[v * 3 + 1] = base[v * 3 + 1] - k * k * 0.015;
    }
    pos.needsUpdate = true;
    pennants.forEach((p, j) => { p.rotation.y = Math.sin(now / 260 + phase + j * 0.9) * 0.45; });
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
// ---------- Estela i ona (E2) ----------
let trailGeo = null;
let printGeo = null;
let rippleGeo = null;
const fadeMesh = (geo, color, opacity) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
// espurnes del color de l'equip que es queden enrere mentre la fitxa salta
function trailDot(pos, color) {
  trailGeo = trailGeo || new THREE.SphereGeometry(0.075, 12, 10);
  const m = fadeMesh(trailGeo, color, 0.85);
  m.position.set(pos.x + rnd3(0.03), pos.y + 0.18, pos.z + rnd3(0.03));
  scene.add(m);
  const y0 = m.position.y;
  tween(700, (t) => {
    const s = 1 - t * 0.8;
    m.scale.set(s, s, s);
    m.position.y = y0 - t * 0.12;
    m.material.opacity = 0.85 * (1 - t);
  }, ease.out).then(() => { scene.remove(m); m.material.dispose(); });
}
// petjada rodona a cada casella per on passa
function footprint(x, z, color) {
  printGeo = printGeo || new THREE.CircleGeometry(0.17, 32);
  const m = fadeMesh(printGeo, color, 0.5);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.007, z);
  scene.add(m);
  tween(1500, (t) => {
    const s = 1 + t * 0.35;
    m.scale.set(s, s, 1);
    m.material.opacity = 0.5 * (1 - t);
  }, ease.out).then(() => { scene.remove(m); m.material.dispose(); });
}
// ones que s'obren a terra quan la fitxa arriba a la casella final
function ripple(x, z, color) {
  rippleGeo = rippleGeo || new THREE.RingGeometry(0.86, 1, 56);
  for (let j = 0; j < 3; j++) {
    setTimeout(() => {
      const m = fadeMesh(rippleGeo, j === 1 ? 0xffffff : color, 0.85);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.008 + j * 0.001, z);
      scene.add(m);
      const max = 0.95 + j * 0.25;
      tween(760, (t) => {
        const s = 0.2 + t * max;
        m.scale.set(s, s, 1);
        m.material.opacity = 0.85 * (1 - t) ** 1.5;
      }, ease.out).then(() => { scene.remove(m); m.material.dispose(); });
    }, j * 120);
  }
}

// només per a proves: deixa la petjada, l'estela i l'ona d'un equip entre dues caselles
export function debugTrail(k, a, b) {
  const color = state.teams[k].color;
  const ca = center(rect(a)); const cb = center(rect(b));
  for (let j = 0; j <= 8; j++) {
    const t = j / 8;
    trailDot({ x: ca.x + (cb.x - ca.x) * t, y: Math.sin(Math.PI * t) * 0.6, z: ca.z + (cb.z - ca.z) * t }, color);
  }
  footprint(ca.x, ca.z, color);
  ripple(cb.x, cb.z, color);
}

export async function hop(k, toPos, jail, { jump = false, onStep, last = false } = {}) {
  const p = pawns[k];
  if (!p) return;
  animating.add(k);
  const from = p.position.clone();
  const prevSpot = { ...displayPos[k] };
  displayPos[k] = { pos: toPos, jail };
  const to = pawnTarget(k);
  const h = jump ? 2.4 : 0.6;
  const inner = p.userData.inner;
  const color = state.teams[k]?.color || '#ffffff';
  inner.position.y = 0;
  camFocus.x = to.x; camFocus.z = to.z;
  let lastDot = 0;
  await tween(jump ? 800 : 270, (t) => {
    p.position.lerpVectors(from, to, t);
    p.position.y = Math.sin(Math.PI * t) * h;
    inner.rotation.y = (jump ? 2 : 0.5) * Math.PI * t;
    const st = 1 + Math.sin(Math.PI * t) * 0.08;
    inner.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
    const now = performance.now();
    if (!reduced() && t > 0.05 && t < 0.95 && now - lastDot > 32) { lastDot = now; trailDot(p.position, color); }
  }, ease.inOut);
  if (!reduced()) {
    footprint(to.x, to.z, color);
    if (last) { ripple(to.x, to.z, color); dustPuff(to.x, to.z, 10, 0.3); }
  }
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

// ---------- Monedes 3D ----------
let coinGeo = null;
let coinMat = null;
// salten monedes d'una casella (o d'un punt) i cauen girant
export function coinBurst(i, n = 12, { power = 1 } = {}) {
  if (reduced() || !scene) return;
  coinGeo = coinGeo || new THREE.CylinderGeometry(0.15, 0.15, 0.035, 28);
  coinMat = coinMat || new THREE.MeshStandardMaterial({ color: 0xFFC83D, metalness: 0.85, roughness: 0.28, emissive: 0x3a2400, emissiveIntensity: 0.3 });
  const c = center(rect(i));
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.castShadow = true;
    m.position.set(c.x + rnd3(0.15), 0.05, c.z + rnd3(0.15));
    scene.add(m);
    const vx = rnd3(1.1) * power; const vz = rnd3(1.1) * power; const vy = (3.4 + Math.random() * 1.8) * power;
    const spin = (Math.random() * 14 + 6) * (Math.random() < 0.5 ? -1 : 1);
    const delay = k * 35;
    const dur = 1500 + Math.random() * 400;
    setTimeout(() => {
      tween(dur, (t) => {
        const s = t * dur / 1000;
        m.position.x = c.x + vx * s;
        m.position.z = c.z + vz * s;
        m.position.y = Math.max(0.02, 0.05 + vy * s - 5.2 * s * s);
        m.rotation.x = spin * s;
        m.rotation.z = spin * 0.6 * s;
        const sc = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
        m.scale.set(sc, sc, sc);
      }, ease.linear).then(() => scene.remove(m));
    }, delay);
  }
}
const rnd3 = (a) => (Math.random() * 2 - 1) * a;

// ---------- Sortida, sirena, presó i tren ----------
export function goBurst() {
  if (!scene) return;
  const c = center(rect(0));
  pulse(0, 0xFFD84D);
  sparkle(c.x, c.z, 26, 1.3);
  coinBurst(0, 12, { power: 0.8 });
}

// tremolor de càmera
let shakeAmp = 0;
let shakeUntil = 0;
function shake(amp = 0.06, dur = 500) {
  if (reduced()) return;
  shakeAmp = amp;
  shakeUntil = performance.now() + dur;
}

// sirena a la cantonada «Ves a la presó»: llum vermella i blava que gira
export function siren() {
  if (!scene || reduced()) return;
  const i = state.config.board.findIndex((s) => s.type === 'gotojail');
  if (i < 0) return;
  const c = center(rect(i));
  const g = new THREE.Group();
  const domeMat = new THREE.MeshStandardMaterial({ color: 0xFF3B3B, emissive: 0xFF2020, emissiveIntensity: 1.5, transparent: true, opacity: 0.95 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0x2A2C5E }));
  base.position.y = 0.05;
  dome.position.y = 0.1;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xFF4040, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 24, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(1.1, 0.25, 0);
  const pivot = new THREE.Group();
  pivot.add(beam);
  pivot.position.y = 0.2;
  const light = new THREE.PointLight(0xff3030, 6, 4);
  light.position.y = 0.5;
  g.add(base, dome, pivot, light);
  g.position.set(c.x, 0.02, c.z);
  g.scale.set(0.01, 0.01, 0.01);
  scene.add(g);
  shake(0.05, 900);
  tween(2200, (t) => {
    const s = t < 0.12 ? ease.back(t / 0.12) : t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
    g.scale.set(s, s, s);
    pivot.rotation.y = t * Math.PI * 7;
    const blue = Math.floor(t * 14) % 2 === 1;
    const col = blue ? 0x3060FF : 0xFF3030;
    light.color.setHex(col);
    beamMat.color.setHex(col);
    domeMat.emissive.setHex(blue ? 0x2040FF : 0xFF2020);
  }, ease.linear).then(() => scene.remove(g));
}

// ---------- Pot del Pàrquing: piles de monedes que creixen ----------
let potGroup = null;
let potAnimNext = false;
export const animatePotNext = () => { potAnimNext = true; };
let potKey = '';
const parkingIndex = () => state.config.board.findIndex((s) => s.type === 'parking');
function potLabelTexture(amount) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 200;
  const g = c.getContext('2d');
  roundRect(g, 10, 10, 492, 180, 60);
  g.fillStyle = '#1C1A3A';
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#FFD84D';
  g.stroke();
  setFont(g, 800, 46, 'normal');
  g.fillStyle = '#FFD84D';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('POT', 256, 62);
  setFont(g, 900, 74, 'normal');
  g.fillStyle = '#FFFFFF';
  g.fillText(money(amount), 256, 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// El pot són bitllets grans que sobresurten per darrere de la cantonada del Pàrquing, fora del
// tauler (no tapen cap casella). Al mig de cada bitllet hi ha una cara: les fotos «bill1..3»
// es guarden només en aquest navegador.
const BILL_W = 1.95;
const BILL_H = 0.91;
const BILL_MAX = 5;
const BILL_KINDS = [
  { v: 500, c: '#D9C2F7', d: '#5B2FA0' },
  { v: 100, c: '#FFD3A0', d: '#A4520A' },
  { v: 50, c: '#BBDDF7', d: '#1F5F9E' },
  { v: 20, c: '#BDEBC8', d: '#17723A' },
  { v: 10, c: '#FFF1A8', d: '#8A7000' },
];
export const BILL_FACES = ['bill1', 'bill2', 'bill3'];
const faceImgs = {};
function billFace(n) {
  const id = BILL_FACES[n % BILL_FACES.length];
  const src = photoOf(id);
  if (!src) return null;
  const cached = faceImgs[id];
  if (cached && cached.src === src) return cached.complete ? cached : null;
  const img = new Image();
  img._k = ++faceSerial;
  img.onload = () => { potKey = ''; syncPot(false); };
  img.src = src;
  faceImgs[id] = img;
  return null;
}
let faceSerial = 0;
// imatge d'una cara ja descodificada (per al bitllet gegant, que no pot esperar a l'onload)
const bigImgs = new Map();
async function readyFace(src) {
  let img = bigImgs.get(src);
  if (!img) {
    img = new Image();
    img._k = ++faceSerial;
    img.src = src;
    bigImgs.set(src, img);
  }
  try { await img.decode(); } catch { bigImgs.delete(src); return null; }
  return img;
}
// bitllets per a una quantitat: els més grossos primer, com a molt BILL_MAX
function billsFor(amount) {
  const out = [];
  let left = amount;
  for (const b of BILL_KINDS) {
    while (left >= b.v && out.length < BILL_MAX) { out.push(b); left -= b.v; }
  }
  if (left > 0 && out.length < BILL_MAX) out.push(BILL_KINDS[BILL_KINDS.length - 1]);
  return out;
}
const billTexCache = {};
function billTexture(kind, face) {
  // cada imatge té el seu número: dues cares diferents no poden compartir textura
  const key = `${kind.v}|${face ? face._k : '-'}`;
  if (billTexCache[key]) return billTexCache[key];
  const W2 = 1024; const H2 = 480;
  const c = document.createElement('canvas');
  c.width = W2; c.height = H2;
  const g = c.getContext('2d');
  roundRect(g, 0, 0, W2, H2, 26);
  g.fillStyle = kind.c;
  g.fill();
  g.save();
  g.clip();
  // trama fina de seguretat
  g.strokeStyle = kind.d;
  g.globalAlpha = 0.1;
  g.lineWidth = 3;
  for (let x = -H2; x < W2; x += 18) { g.beginPath(); g.moveTo(x, H2); g.lineTo(x + H2, 0); g.stroke(); }
  g.globalAlpha = 1;
  g.restore();
  // marc amb ratlletes
  const m = 30; const band = 26;
  g.strokeStyle = kind.d;
  g.lineWidth = 6;
  g.strokeRect(m, m, W2 - 2 * m, H2 - 2 * m);
  g.strokeRect(m + band, m + band, W2 - 2 * (m + band), H2 - 2 * (m + band));
  g.fillStyle = kind.d;
  for (let x = m + band + 6; x < W2 - m - band - 6; x += 15) {
    g.fillRect(x, m + 6, 6, band - 9);
    g.fillRect(x, H2 - m - band + 3, 6, band - 9);
  }
  for (let y = m + band + 6; y < H2 - m - band - 6; y += 15) {
    g.fillRect(m + 6, y, band - 9, 6);
    g.fillRect(W2 - m - band + 3, y, band - 9, 6);
  }
  // xifres a les cantonades
  const box = (x, y, w, h) => { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x, y, w, h); g.lineWidth = 5; g.strokeRect(x, y, w, h); };
  const num = (x, y) => {
    box(x, y, 190, 100);
    setFont(g, 900, 80, 'condensed');
    g.fillStyle = kind.d; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(kind.v), x + 95, y + 54);
  };
  num(100, 96);
  num(W2 - 290, H2 - 196);
  // a l'altra diagonal: una tenda i el nom del banc
  box(W2 - 290, 96, 190, 100);
  g.beginPath();
  g.moveTo(W2 - 195, 108); g.lineTo(W2 - 140, 186); g.lineTo(W2 - 250, 186); g.closePath();
  g.fillStyle = kind.d; g.fill();
  g.beginPath();
  g.moveTo(W2 - 195, 140); g.lineTo(W2 - 178, 186); g.lineTo(W2 - 212, 186); g.closePath();
  g.fillStyle = kind.c; g.fill();
  box(100, H2 - 196, 190, 100);
  setFont(g, 800, 30, 'condensed');
  g.fillStyle = kind.d;
  g.fillText('BANC', 195, H2 - 162);
  g.fillText('DEL CAU', 195, H2 - 128);
  // nom a dalt
  setFont(g, 900, 46, 'normal');
  const tw = g.measureText('CAUPOLI').width + 50;
  roundRect(g, W2 / 2 - tw / 2, 66, tw, 64, 14);
  g.fillStyle = kind.d; g.fill();
  g.fillStyle = '#fff';
  g.fillText('CAUPOLI', W2 / 2, 101);
  // retrat rodó al mig
  const cx = W2 / 2; const cy = 290; const r = 128;
  g.beginPath(); g.arc(cx, cy, r + 14, 0, Math.PI * 2); g.fillStyle = kind.d; g.fill();
  g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  const bg = g.createRadialGradient(cx, cy - 30, 10, cx, cy, r);
  bg.addColorStop(0, '#FFFFFF'); bg.addColorStop(1, kind.c);
  g.fillStyle = bg;
  g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  if (face) {
    const s = Math.min(face.width, face.height);
    g.drawImage(face, (face.width - s) / 2, (face.height - s) / 2, s, s, cx - r * 1.04, cy - r * 1.04, r * 2.08, r * 2.08);
  } else {
    // sense foto: una rosa dels vents
    g.translate(cx, cy);
    g.fillStyle = kind.d;
    for (let k = 0; k < 8; k++) {
      const big = k % 2 === 0;
      g.beginPath();
      g.moveTo(0, -(big ? r * 0.8 : r * 0.5));
      g.lineTo(big ? 18 : 12, 0); g.lineTo(-(big ? 18 : 12), 0);
      g.closePath(); g.fill();
      g.rotate(Math.PI / 4);
    }
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  billTexCache[key] = t;
  return t;
}
// Els bitllets surten de la cantonada com els pètals d'un ventall: cap amunt, en diagonal i cap a
// l'esquerra. Els que porten cara queden repartits i al davant perquè es vegin sencers.
const FAN_FROM = THREE.MathUtils.degToRad(128);
const FAN_TO = THREE.MathUtils.degToRad(200);
function fanAngles(n) {
  if (n === 1) return [THREE.MathUtils.degToRad(135)];
  return Array.from({ length: n }, (_, k) => FAN_FROM + (k / (n - 1)) * (FAN_TO - FAN_FROM));
}
function faceSlots(n) {
  if (n <= 3) return Array.from({ length: n }, (_, k) => k);
  return [0, Math.round((n - 1) / 2), n - 1];
}
function fanPose(k, n) {
  const th = fanAngles(n)[k];
  const front = faceSlots(n).includes(k);
  return { th, z: (front ? 0.06 : 0) + k * 0.008 };
}
const BILL_IN = 0.2; // tros del bitllet amagat darrere el tauler
function placeBill(piv, b, p) {
  piv.position.z = p.z;
  piv.rotation.z = p.th - Math.PI;
  b.position.x = -(BILL_W / 2 - BILL_IN);
}
function potAnchor() {
  const h = L() / 2 + 0.27;
  return new THREE.Vector3(-h + 0.2, -0.22, -h - 0.1);
}
function makeFan() {
  const fan = new THREE.Group();
  fan.position.copy(potAnchor());
  fan.rotation.set(-0.22, 0.12, 0, 'YXZ');
  return fan;
}
// punts que la càmera ha d'encabir perquè el ventall ple no surti de la pantalla
function potBounds() {
  const fan = makeFan();
  fan.updateMatrixWorld();
  const pts = [];
  for (let k = 0; k < BILL_MAX; k++) {
    const piv = new THREE.Object3D();
    const b = new THREE.Object3D();
    piv.add(b);
    placeBill(piv, b, fanPose(k, BILL_MAX));
    fan.add(piv);
    fan.updateMatrixWorld(true);
    [[-BILL_W / 2, BILL_H / 2], [-BILL_W / 2, -BILL_H / 2]].forEach(([x, y]) => pts.push(new THREE.Vector3(x, y, 0).applyMatrix4(b.matrixWorld)));
  }
  return pts;
}
let billGeo = null;
function syncPot(animate) {
  const i = parkingIndex();
  const on = i >= 0 && rules().parkingPot;
  const amount = on ? state.pot || 0 : 0;
  const faces = BILL_FACES.map((id) => photoOf(id).length).join(',');
  const key = `${i}|${on}|${amount}|${faces}`;
  if (key === potKey) return;
  const before = Number(potKey.split('|')[2] || 0);
  potKey = key;
  const old = potGroup;
  potGroup = null;
  if (old) {
    if (animate && amount < before && !reduced()) {
      // el pot se'n va: els bitllets surten volant cap al centre del tauler
      old.userData.bills.forEach((b, k) => {
        b.material.transparent = true;
        const from = b.position.clone();
        setTimeout(() => tween(700, (t) => {
          b.position.set(from.x + t * 1.2, from.y + Math.sin(t * Math.PI) * 0.8 + t * 0.6, from.z + t * 2.2);
          b.material.opacity = 1 - t;
        }, ease.inOut), k * 70);
      });
      setTimeout(() => scene.remove(old), 700 + old.userData.bills.length * 70);
    } else scene.remove(old);
  }
  if (!on || amount <= 0) return;
  billGeo = billGeo || new THREE.PlaneGeometry(BILL_W, BILL_H);
  const list = billsFor(amount);
  const n = list.length;
  const fan = makeFan();
  const bills = [];
  const prevN = animate && amount > before ? billsFor(before).length : n;
  const slots = faceSlots(n);
  list.forEach((kind, k) => {
    // les cares van als bitllets repartits pel ventall, que queden al davant
    const s = slots.indexOf(k);
    const face = s >= 0 ? billFace(s) : null;
    const mat = new THREE.MeshStandardMaterial({ map: billTexture(kind, face), roughness: 0.7, side: THREE.DoubleSide });
    const b = new THREE.Mesh(billGeo, mat);
    b.castShadow = true;
    const piv = new THREE.Group();
    piv.add(b);
    placeBill(piv, b, fanPose(k, n));
    fan.add(piv);
    bills.push(b);
    // els bitllets nous surten des de darrere del tauler
    if (k >= prevN && !reduced()) {
      const x0 = b.position.x;
      b.position.x = x0 + BILL_W * 0.75;
      setTimeout(() => tween(560, (t) => { b.position.x = x0 + BILL_W * 0.75 * (1 - t); }, ease.back), (k - prevN) * 90);
    }
  });
  fan.userData.bills = bills;
  // cartell amb el total, fora del tauler i a sota del ventall
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: potLabelTexture(amount), depthWrite: false }));
  label.scale.set(1.05, 0.41, 1);
  label.position.set(-L() / 2 - 0.8, 0.2, -L() / 2 + 1.7);
  label.renderOrder = 12;
  const group = new THREE.Group();
  group.add(fan, label);
  group.userData.bills = bills;
  potGroup = group;
  scene.add(group);
}

// ---------- Fallida amb drama (E8) ----------
// La fitxa trontolla i cau de costat, es torna grisa, i les plaques de les seves propietats tornen
// volant al banc (al centre del tauler) mentre les cases s'enfonsen.
export async function bankruptFx(k, squares = []) {
  if (!scene) return;
  dying.add(k);
  const p = pawns[k];
  const finish = () => {
    squares.forEach((i) => {
      if (plaques[i] && !state.owners[i]) { scene.remove(plaques[i].mesh); delete plaques[i]; }
      if (!state.owners[i]) { (houses[i] || []).forEach((m) => scene.remove(m)); houses[i] = []; }
      if (mortMarks[i] && !state.owners[i]) { scene.remove(mortMarks[i]); delete mortMarks[i]; }
    });
    if (p) {
      const inner = p.userData.inner;
      inner.rotation.z = 0;
      inner.position.y = 0;
      p.scale.set(1, 1, 1);
      if (p.userData.sprite) p.userData.sprite.material.opacity = 1;
    }
    dying.delete(k);
    refresh(false);
  };
  if (reduced()) { finish(); return; }
  shake(0.05, 700);
  // la fitxa trontolla i cau
  if (p) {
    const inner = p.userData.inner;
    const grey = new THREE.Color(0x8A8FA8);
    const from = p.userData.mat.color.clone();
    const spr = p.userData.sprite;
    if (spr) spr.material.transparent = true;
    tween(500, (t) => { inner.rotation.z = Math.sin(t * Math.PI * 3) * 0.18 * (1 - t); }, ease.linear).then(() => {
      tween(650, (t) => {
        inner.rotation.z = ease.bounce(t) * (Math.PI / 2) * 0.92;
        p.userData.mat.color.copy(from).lerp(grey, t);
        if (spr) spr.material.opacity = 1 - t * 0.7;
      }, ease.linear).then(() => { dustPuff(p.position.x, p.position.z, 14, 0.45); sfxHook?.('poof'); });
    });
  }
  // les plaques tornen al banc
  let longest = 1300;
  squares.forEach((i, j) => {
    const pl = plaques[i];
    const hs = houses[i] || [];
    const delay = 500 + j * 130;
    longest = Math.max(longest, delay + 1000);
    setTimeout(() => {
      hs.forEach((m) => {
        const y0 = m.position.y;
        tween(420, (t) => { m.scale.setScalar(1 - t); m.position.y = y0 - t * 0.2; }, ease.inOut);
      });
      if (!pl) return;
      const m = pl.mesh;
      const from = m.position.clone();
      const to = new THREE.Vector3(rnd3(0.4), 0.35, rnd3(0.4));
      const spin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
      tween(950, (t) => {
        m.position.lerpVectors(from, to, t);
        m.position.y = from.y + Math.sin(Math.PI * t) * 1.6 + (to.y - from.y) * t;
        m.rotation.y = spin * t * Math.PI;
        m.rotation.x = t * Math.PI * 0.5;
        const s = 1 - t * 0.85;
        m.scale.set(s, s, s);
      }, ease.inOut).then(() => { scene.remove(m); sparkle(to.x, to.z, 6, 0.5); });
    }, delay);
  });
  await new Promise((r) => setTimeout(r, longest));
  // la fitxa s'esvaeix
  if (p) await tween(380, (t) => { p.scale.setScalar(1 - t); }, ease.inOut);
  finish();
}

// ---------- Guanyador (E9) ----------
// Sense moure la càmera: el tauler s'enfosqueix, un focus il·lumina la fitxa guanyadora, que s'aixeca i
// gira, li cau una corona daurada i esclaten focs artificials del color de l'equip.
let crown = null;
let crownTeam = -1;
function makeCrown() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xFFC83D, metalness: 0.85, roughness: 0.25, emissive: 0x3a2400, emissiveIntensity: 0.35 });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.08, 32, 1, true), gold);
  band.material.side = THREE.DoubleSide;
  band.castShadow = true;
  g.add(band);
  const gems = [0xE8473B, 0x2D7FF9, 0x2E9E5B, 0xE8473B, 0x2D7FF9];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), gold);
    spike.position.set(Math.cos(a) * 0.14, 0.085, Math.sin(a) * 0.14);
    g.add(spike);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), gold);
    ball.position.set(Math.cos(a) * 0.14, 0.145, Math.sin(a) * 0.14);
    g.add(ball);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: gems[k], roughness: 0.2, emissive: gems[k], emissiveIntensity: 0.3 }));
    gem.position.set(Math.cos(a + Math.PI / 5) * 0.142, 0, Math.sin(a + Math.PI / 5) * 0.142);
    g.add(gem);
  }
  return g;
}
const CROWN_Y = 0.62;
function syncCrown() {
  const w = state.winner;
  const want = w !== undefined && w !== null && pawns[w] && !team(w).bankrupt ? w : -1;
  if (want === crownTeam) return;
  if (crown) { crown.parent?.remove(crown); crown = null; }
  if (crownTeam >= 0 && pawns[crownTeam]?.userData.sprite) pawns[crownTeam].userData.sprite.position.y = 0.85;
  crownTeam = want;
  if (want < 0) return;
  crown = makeCrown();
  crown.position.y = CROWN_Y;
  pawns[want].userData.inner.add(crown);
  if (pawns[want].userData.sprite) pawns[want].userData.sprite.position.y = 1.05;
}
function firework(x, z, color, delay) {
  setTimeout(() => {
    if (!scene) return;
    const geo = new THREE.SphereGeometry(0.045, 8, 6);
    const y0 = 0.2;
    const top = 2.2 + Math.random() * 1.2;
    const rocket = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xFFE9A0 }));
    rocket.position.set(x, y0, z);
    scene.add(rocket);
    tween(650, (t) => { rocket.position.y = y0 + (top - y0) * ease.out(t); }, ease.linear).then(() => {
      scene.remove(rocket);
      sfxHook?.('firework');
      const n = 26;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const el = (Math.random() - 0.3) * 1.2;
        const col = k % 3 === 0 ? 0xFFD84D : color;
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true }));
        m.position.set(x, top, z);
        scene.add(m);
        const v = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(1.1 + Math.random() * 0.4);
        tween(1100, (t) => {
          m.position.set(x + v.x * t, top + v.y * t - 1.2 * t * t, z + v.z * t);
          m.material.opacity = 1 - t;
          const s = 1 - t * 0.6;
          m.scale.setScalar(s);
        }, ease.out).then(() => { scene.remove(m); m.material.dispose(); });
      }
    });
  }, delay);
}
export async function winnerFx(k) {
  if (!scene) return;
  syncCrown();
  const p = pawns[k];
  if (!p || reduced()) return;
  const color = new THREE.Color(team(k).color);
  // el tauler s'enfosqueix una estona
  const l = L() + 0.6;
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(l, l), new THREE.MeshBasicMaterial({ color: 0x0A0820, transparent: true, opacity: 0, depthWrite: false }));
  dim.rotation.x = -Math.PI / 2;
  dim.position.y = 0.012;
  dim.renderOrder = 2;
  scene.add(dim);
  // focus sobre la fitxa
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.6, 5, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xFFF1B8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.set(p.position.x, 2.5, p.position.z);
  scene.add(beam);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), new THREE.MeshBasicMaterial({ color: 0xFFF1B8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(p.position.x, 0.02, p.position.z);
  scene.add(pool);
  tween(700, (t) => { dim.material.opacity = 0.55 * t; beam.material.opacity = 0.22 * t; pool.material.opacity = 0.35 * t; }, ease.out);
  // la corona cau damunt la fitxa
  if (crown) {
    crown.position.y = CROWN_Y + 2.4;
    setTimeout(() => tween(800, (t) => { crown.position.y = CROWN_Y + 2.4 * (1 - t); }, ease.bounce).then(() => { sparkle(p.position.x, p.position.z, 24, 1.4); sfxHook?.('hotel'); }), 600);
  }
  // focs artificials al voltant del tauler
  const h = L() / 2;
  const spots = [[-h * 0.6, -h * 0.4], [h * 0.6, -h * 0.4], [0, -h * 0.7], [-h * 0.5, h * 0.3], [h * 0.5, h * 0.3], [0, 0]];
  for (let j = 0; j < 9; j++) {
    const s = spots[j % spots.length];
    firework(s[0] + rnd3(0.6), s[1] + rnd3(0.6), color, 900 + j * 520);
  }
  // l'ambient torna a la normalitat
  setTimeout(() => {
    tween(1200, (t) => { dim.material.opacity = 0.55 * (1 - t); beam.material.opacity = 0.22 * (1 - t); pool.material.opacity = 0.35 * (1 - t); }, ease.inOut)
      .then(() => { [dim, beam, pool].forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); });
  }, 6500);
  await new Promise((r) => setTimeout(r, 1600));
}

// qui cau al Pàrquing s'emporta el pot
export function potWin(teamIdx) {
  const i = parkingIndex();
  if (i < 0 || !scene) return;
  coinBurst(i, 14, { power: 0.8 });
  const p = pawns[teamIdx];
  if (p) sparkle(p.position.x, p.position.z, 18, 1);
  shake(0.03, 400);
}
// imatge d'un bitllet gran (el de més valor que cap a la quantitat), amb la cara que toca.
// Espera que la foto estigui descodificada: abans, si la foto encara no s'havia carregat
// (primer bitllet o partida nova amb cares noves), el bitllet sortia sense cara.
let bigFace = 0;
export async function billImage(amount) {
  const kind = BILL_KINDS.find((b) => amount >= b.v) || BILL_KINDS[BILL_KINDS.length - 1];
  const srcs = BILL_FACES.map((id) => photoOf(id)).filter(Boolean);
  // si no hi ha cares de bitllet, una de la galeria
  if (!srcs.length) { const f = randomFace(); if (f) srcs.push(f); }
  let face = null;
  for (let k = 0; k < srcs.length && !face; k++) face = await readyFace(srcs[(bigFace + k) % srcs.length]);
  bigFace++;
  return billTexture(kind, face).image;
}
export function potScreenPos() {
  if (!camera || !renderer || !potGroup) return null;
  const v = potAnchor().add(new THREE.Vector3(-0.3, 0.5, 0)).project(camera);
  const b = renderer.domElement.getBoundingClientRect();
  return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
}

// gàbies de barrots damunt dels equips empresonats
const cages = {};
let cageMat = null;
function makeCage() {
  cageMat = cageMat || new THREE.MeshStandardMaterial({ color: 0xC9CDDA, metalness: 0.8, roughness: 0.3 });
  const g = new THREE.Group();
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.78, 6), cageMat);
    bar.position.set(Math.cos(a) * 0.25, 0.39, Math.sin(a) * 0.25);
    bar.castShadow = true;
    g.add(bar);
  }
  [0.02, 0.78].forEach((y) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.018, 8, 36), cageMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  });
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.25, 28), cageMat);
  lid.rotation.x = -Math.PI / 2;
  lid.position.y = 0.78;
  g.add(lid);
  return g;
}
function syncCages() {
  state.teams.forEach((t, k) => {
    const want = t.jail && !t.bankrupt && displayPos?.[k]?.jail && pawns[k];
    if (want && !cages[k]) {
      const g = makeCage();
      const p = pawns[k].position;
      g.position.set(p.x, reduced() ? 0 : 1.6, p.z);
      scene.add(g);
      cages[k] = g;
      if (!reduced()) {
        tween(700, (q) => { g.position.y = (1 - q) * 1.6; }, ease.bounce).then(() => { dustPuff(g.position.x, g.position.z, 8, 0.35); sfxHook?.('build'); });
      }
    } else if (!want && cages[k]) {
      const g = cages[k];
      delete cages[k];
      tween(reduced() ? 1 : 600, (q) => { g.position.y = q * 1.8; g.scale.setScalar(1 - q * 0.5); }, ease.inOut).then(() => scene.remove(g));
    }
  });
}

// trenet que passa per les vies d'una estació
let trainProto = null;
function makeTrain() {
  if (trainProto) return trainProto.clone();
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xE8473B, roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xF5F5FA, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1C2756, roughness: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1C1A3A, roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xFFE7A0, emissive: 0xFFC94D, emissiveIntensity: 0.8 });
  g.add(box(0.46, 0.12, 0.15, white, 0, 0.09, 0));
  g.add(box(0.46, 0.035, 0.155, red, 0, 0.065, 0));
  g.add(box(0.44, 0.03, 0.13, red, 0, 0.165, 0));
  for (let k = 0; k < 4; k++) g.add(box(0.06, 0.04, 0.157, dark, -0.15 + k * 0.1, 0.11, 0));
  g.add(box(0.01, 0.025, 0.04, yellow, 0.235, 0.07, 0.04));
  g.add(box(0.01, 0.025, 0.04, yellow, 0.235, 0.07, -0.04));
  [-0.14, 0.14].forEach((x) => [-0.06, 0.06].forEach((z) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 12), black);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.03, z);
    g.add(w);
  }));
  trainProto = g;
  return g.clone();
}
export function train(i) {
  if (!scene || reduced()) return;
  const r = rect(i);
  const along = r.side === 'b' || r.side === 't';
  let cx; let cz;
  if (r.side === 'b') cz = r.z0 + BAND / 2; else if (r.side === 't') cz = r.z1 - BAND / 2;
  if (r.side === 'l') cx = r.x1 - BAND / 2; else if (r.side === 'r') cx = r.x0 + BAND / 2;
  const m = makeTrain();
  m.scale.setScalar(0.85);
  if (!along) m.rotation.y = Math.PI / 2;
  scene.add(m);
  const a0 = along ? r.x0 - 0.15 : r.z1 + 0.15;
  const a1 = along ? r.x1 + 0.15 : r.z0 - 0.15;
  tween(1500, (t) => {
    const a = a0 + (a1 - a0) * t;
    if (along) m.position.set(a, 0.005, cz); else m.position.set(cx, 0.005, a);
    const s = 0.85 * Math.min(1, t / 0.15, (1 - t) / 0.15);
    m.scale.setScalar(Math.max(0.01, s));
    m.position.y = 0.005 + Math.abs(Math.sin(t * 40)) * 0.006;
  }, ease.inOut).then(() => scene.remove(m));
}

// on van les piles de cartes: amb foto al centre, a les cantonades de baix (i més petites) per no tapar cares
function placeDecks() {
  ['good', 'bad'].forEach((d, k) => {
    const g = decks[d]?.group;
    if (!g) return;
    if (centerImg) { g.position.set(k ? 1.9 : -1.9, 0, 1.78); g.scale.set(0.78, 0.78, 0.78); } else { g.position.set(k ? 1.35 : -1.35, 0, 0.95); g.scale.set(1, 1, 1); }
  });
}

// núvol de pols on cau una casa
let dustMat = null;
let dustGeo = null;
function dustPuff(x, z, n = 10, spread = 0.35) {
  if (reduced() || !scene) return;
  dustGeo = dustGeo || new THREE.SphereGeometry(0.05, 10, 8);
  for (let k = 0; k < n; k++) {
    const mat = (dustMat || (dustMat = new THREE.MeshStandardMaterial({ color: 0xEDE6D8, roughness: 1, transparent: true }))).clone();
    const m = new THREE.Mesh(dustGeo, mat);
    const ang = (k / n) * Math.PI * 2 + Math.random() * 0.4;
    m.position.set(x, 0.04, z);
    scene.add(m);
    const dx = Math.cos(ang) * spread * (0.6 + Math.random() * 0.6);
    const dz = Math.sin(ang) * spread * (0.6 + Math.random() * 0.6);
    tween(650 + Math.random() * 250, (t) => {
      m.position.set(x + dx * t, 0.04 + t * 0.18, z + dz * t);
      const s = 1 + t * 2.4;
      m.scale.set(s, s, s);
      mat.opacity = 0.85 * (1 - t);
    }, ease.out).then(() => { scene.remove(m); mat.dispose(); });
  }
}

// espurnes daurades (hotel, Sortida)
function sparkle(x, z, n = 16, height = 0.8) {
  if (reduced() || !scene) return;
  const geo = new THREE.OctahedronGeometry(0.04, 0);
  for (let k = 0; k < n; k++) {
    const mat = new THREE.MeshBasicMaterial({ color: k % 3 ? 0xFFD84D : 0xFFFFFF, transparent: true });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.2, z);
    scene.add(m);
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.2 + Math.random() * 0.4;
    const up = height * (0.5 + Math.random() * 0.8);
    tween(800 + Math.random() * 300, (t) => {
      m.position.set(x + Math.cos(ang) * rad * t, 0.2 + up * Math.sin(Math.PI * t * 0.8), z + Math.sin(ang) * rad * t);
      m.rotation.y += 0.2;
      mat.opacity = 1 - t;
    }, ease.out).then(() => { scene.remove(m); mat.dispose(); });
  }
}

// segell que cau damunt d'una casella («VENUT», «MULTA»)
export function stampSquare(i, color, text) {
  if (!scene) return;
  const r = rect(i);
  const c = center(r);
  const size = Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.95;
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');
  g.translate(256, 256);
  g.rotate(-0.22);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 26;
  roundRect(g, -220, -110, 440, 220, 30);
  g.stroke();
  g.lineWidth = 8;
  roundRect(g, -190, -82, 380, 164, 18);
  g.stroke();
  setFont(g, 900, 120, 'expanded');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 8);
  // textura de tinta: alguns forats aleatoris
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 140; k++) { g.beginPath(); g.arc(Math.random() * 440 - 220, Math.random() * 220 - 110, Math.random() * 5, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = (Math.random() - 0.5) * 0.3;
  m.renderOrder = 5;
  m.position.set(c.x, 1.4, c.z);
  m.scale.set(1.8, 1.8, 1.8);
  scene.add(m);
  const done = () => { scene.remove(m); m.geometry.dispose(); mat.dispose(); tex.dispose(); };
  if (reduced()) { m.position.y = 0.02; m.scale.set(1, 1, 1); setTimeout(done, 1500); return; }
  tween(300, (t) => {
    m.position.y = 1.4 - 1.38 * t;
    const s = 1.8 - 0.8 * t;
    m.scale.set(s, s, s);
  }, (p) => p * p).then(() => {
    dustPuff(c.x, c.z, 8, 0.45);
    setTimeout(() => tween(450, (t) => { mat.opacity = 1 - t; }, ease.linear).then(done), 1500);
  });
}

// posició a la pantalla del centre d'una casella (per fer-hi volar coses en HTML)
export function screenPos(i) {
  if (!camera || !renderer) return null;
  const c = center(rect(i));
  const v = new THREE.Vector3(c.x, 0.05, c.z).project(camera);
  const b = renderer.domElement.getBoundingClientRect();
  return { x: b.left + (v.x + 1) / 2 * b.width, y: b.top + (1 - v.y) / 2 * b.height };
}

// la placa de l'amo fa un bot (qui cobra)
export function bouncePlaque(i) {
  const p = plaques[i];
  if (!p || reduced()) return;
  const m = p.mesh;
  const y0 = 0.025;
  // tres bots que es van fent petits, i la placa creix mentre salta
  tween(1500, (t) => {
    const b = Math.abs(Math.sin(Math.PI * 3 * t)) * (1 - t);
    m.position.y = y0 + b * 0.9;
    const s = 1 + b * 0.8;
    m.scale.set(s, 1 + b * 2, s);
    m.rotation.x = Math.sin(Math.PI * 6 * t) * 0.15 * (1 - t);
  }, ease.linear).then(() => { m.position.y = y0; m.scale.set(1, 1, 1); m.rotation.x = 0; });
  const o = state.owners[i];
  if (o) pulse(i, new THREE.Color(team(o.team).color).getHex());
}

// cara d'una carta: capçalera del color del mall, el text i el resum de l'efecte
// ---------- Cara de les cartes (E7) ----------
// Un sol dibuix per a la carta 3D i per a la finestra: capçalera del color del mall amb vora ondulada,
// medalló amb un dibuix segons l'efecte, el text al mig, i a baix què fa (verd si cobra, vermell si paga).
function cardIcon(ctx, effect, value, col) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const v = Number(value) || 0;
  const coin = (x, y, r) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    setFont(ctx, 900, r * 1.15, 'normal');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('€', x, y + 2);
  };
  switch (effect) {
    case 'money': case 'perprop': case 'moneyeach': coin(0, 0, 40); break;
    case 'each':
      [-38, 0, 38].forEach((x, k) => {
        const y = k === 1 ? -6 : 6;
        ctx.beginPath(); ctx.arc(x, y - 18, 12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y + 22, 20, Math.PI, 0); ctx.fill();
      });
      break;
    case 'goto': case 'goback': case 'station': case 'anywhere':
      ctx.beginPath(); ctx.moveTo(-22, 44); ctx.lineTo(-22, -44); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-18, -42); ctx.lineTo(34, -26); ctx.lineTo(-18, -8); ctx.closePath(); ctx.fill();
      break;
    case 'move': {
      const d = v >= 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(-40 * d, 14); ctx.quadraticCurveTo(0, -40, 34 * d, 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(40 * d, 12); ctx.lineTo(16 * d, 8); ctx.lineTo(34 * d, -14); ctx.closePath(); ctx.fill();
      break;
    }
    case 'jail':
      roundRect(ctx, -40, -40, 80, 80, 10); ctx.stroke();
      [-14, 14].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, -40); ctx.lineTo(x, 40); ctx.stroke(); });
      break;
    case 'jailfree':
      ctx.beginPath(); ctx.arc(-20, 0, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(44, 0); ctx.moveTo(30, 0); ctx.lineTo(30, 16); ctx.moveTo(42, 0); ctx.lineTo(42, 12); ctx.stroke();
      break;
    case 'repairs':
      // martell: mànec en diagonal i cap travesser
      ctx.beginPath(); ctx.moveTo(-26, 40); ctx.lineTo(12, -18); ctx.stroke();
      ctx.save(); ctx.translate(14, -20); ctx.rotate(Math.atan2(-58, 38) + Math.PI / 2); roundRect(ctx, -34, -13, 68, 26, 6); ctx.fill(); ctx.restore();
      break;
    case 'skip': case 'skipother':
      setFont(ctx, 900, 54, 'normal');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Z', -14, 10); setFont(ctx, 900, 36, 'normal'); ctx.fillText('z', 22, -18);
      break;
    case 'half':
      // farmaciola: caixa amb una creu
      roundRect(ctx, -40, -28, 80, 62, 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, -28); ctx.lineTo(-14, -40); ctx.lineTo(14, -40); ctx.lineTo(14, -28); ctx.stroke();
      ctx.fillRect(-6, -16, 12, 38); ctx.fillRect(-19, -3, 38, 12);
      break;
    case 'extra':
      roundRect(ctx, -36, -36, 72, 72, 14); ctx.stroke();
      [[-16, -16], [16, 16], [0, 0], [16, -16], [-16, 16]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); });
      break;
    default:
      roundRect(ctx, -40, -32, 80, 54, 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, 22); ctx.lineTo(-22, 40); ctx.lineTo(4, 22); ctx.stroke();
  }
  ctx.restore();
}
let cardFaceImg = null;
export const setCardFace = (img) => { cardFaceImg = img; };
export function cardFaceCanvas(deck, card = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 720;
  const ctx = c.getContext('2d');
  const good = deck === 'good';
  const col = good ? '#23A55A' : '#3A3F96';
  const deep = good ? '#16733D' : '#262A6E';
  // paper
  roundRect(ctx, 0, 0, 512, 720, 34);
  ctx.fillStyle = '#FFFDF8';
  ctx.fill();
  ctx.save();
  roundRect(ctx, 0, 0, 512, 720, 34);
  ctx.clip();
  // capçalera amb vora ondulada
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(512, 0); ctx.lineTo(512, 150);
  for (let x = 512; x >= 0; x -= 32) ctx.quadraticCurveTo(x - 16, x % 64 ? 168 : 132, x - 32, 150);
  ctx.closePath();
  ctx.fill();
  // trama fina a la capçalera
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 6;
  for (let x = -200; x < 600; x += 26) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 150, 150); ctx.stroke(); }
  ctx.restore();
  // marc: vora del color del mall i corda puntejada a dins
  ctx.lineWidth = 12;
  ctx.strokeStyle = col;
  roundRect(ctx, 6, 6, 500, 708, 30);
  ctx.stroke();
  ctx.setLineDash([2, 14]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = good ? 'rgba(35,165,90,.45)' : 'rgba(58,63,150,.4)';
  roundRect(ctx, 28, 186, 456, 506, 20);
  ctx.stroke();
  ctx.setLineDash([]);
  // nom del mall
  setFont(ctx, 900, 52, 'normal');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = deep;
  ctx.shadowOffsetY = 4;
  ctx.fillText(deckName(rules(), deck).toUpperCase(), 256, 64);
  ctx.shadowColor = 'transparent';
  // medalló: una cara de la galeria (més gran) o, si no n'hi ha, el dibuix de l'efecte
  if (cardFaceImg) {
    const R = 100;
    ctx.beginPath(); ctx.arc(256, 182, R, 0, Math.PI * 2); ctx.fillStyle = '#E9E4F5'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.drawImage(cardFaceImg, 256 - R, 182 - R, R * 2, R * 2);
    ctx.restore();
    ctx.beginPath(); ctx.arc(256, 182, R, 0, Math.PI * 2);
    ctx.lineWidth = 10; ctx.strokeStyle = col; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(256, 168, 66, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = col; ctx.stroke();
    ctx.save(); ctx.translate(256, 168); ctx.scale(0.82, 0.82); cardIcon(ctx, card.effect, card.value, col); ctx.restore();
  }
  // text
  let s = 50;
  let lines;
  const area = cardFaceImg ? 296 : 330;
  for (; s >= 24; s -= 2) {
    setFont(ctx, 800, s, 'semi-condensed');
    lines = wrap(ctx, card.text || '', 410);
    if (lines.length * s * 1.2 <= area) break;
  }
  ctx.fillStyle = INK;
  const top = (cardFaceImg ? 296 : 262) + (area - lines.length * s * 1.2) / 2;
  lines.forEach((l, k) => ctx.fillText(l, 256, top + s * 0.6 + k * s * 1.2));
  // què fa la carta, amb color segons si es cobra o es paga
  if (card.foot) {
    const v = Number(card.value) || 0;
    const tone = ['money', 'each', 'moneyeach'].includes(card.effect) ? (v >= 0 ? 'good' : 'bad') : card.effect === 'jail' || card.effect === 'skip' || card.effect === 'half' || card.effect === 'repairs' ? 'bad' : card.effect === 'text' ? 'neutral' : 'good';
    const bg = { good: '#E3F5EA', bad: '#FBE6E4', neutral: '#EEF1FA' }[tone];
    const fg = { good: '#167A3F', bad: '#B22A20', neutral: INK }[tone];
    setFont(ctx, 900, 32, 'normal');
    const w = Math.min(430, ctx.measureText(card.foot).width + 60);
    roundRect(ctx, 256 - w / 2, 612, w, 62, 31);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    let fs = 32;
    while (ctx.measureText(card.foot).width > w - 30 && fs > 20) { fs -= 2; setFont(ctx, 900, fs, 'normal'); }
    ctx.fillText(card.foot, 256, 644);
  }
  return c;
}
export const cardFaceImage = (deck, card) => cardFaceCanvas(deck, card).toDataURL();
function cardFaceTexture(deck, card) {
  const c = cardFaceCanvas(deck, card);
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
  const faceM = new THREE.MeshStandardMaterial({ map: cardFaceTexture(deck, card || {}), roughness: 0.5 });
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
  liveCard = { pivot, mesh, mats: [side, backM, faceM], id: ++cardSeq };
  // 1) s'aixeca de la pila; 2) ve cap a tu mentre es gira de cap per avall a cap per amunt, sempre plana
  const lifted = new THREE.Vector3(start.x, start.y + 0.45, start.z);
  const toward = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0.6, 0.6), camera.position, 0.5);
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

// la carta se'n va quan ja s'ha llegit; amb id, només si encara és aquella carta
// (així tancar una finestra no fa fora la carta següent mentre s'està girant)
let cardSeq = 0;
export const currentCardId = () => liveCard?.id ?? null;
export function dropCard(instant = false, id = null) {
  if (!liveCard || (id !== null && liveCard.id !== id)) return;
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

let halo = null;
let haloFill = null;
let haloColor = '';
function updateHalo(now) {
  if (!halo) return;
  const p = pawns[turnTeam];
  const T = state?.teams?.[turnTeam];
  const show = !!p && !!T && !T.bankrupt && p.visible && state.winner === undefined;
  halo.visible = show;
  haloFill.visible = show;
  if (!show) return;
  if (haloColor !== T.color) {
    haloColor = T.color;
    halo.material.color.set(T.color);
    haloFill.material.color.set(T.color);
  }
  halo.position.set(p.position.x, 0.012, p.position.z);
  haloFill.position.set(p.position.x, 0.011, p.position.z);
  const pulse = 1 + Math.sin(now / 260) * 0.08;
  halo.scale.set(pulse, pulse, 1);
  halo.material.opacity = 0.55 + Math.sin(now / 260) * 0.2;
}

export function setTurn(k) { turnTeam = k; }

// la càmera s'acosta un moment a la fitxa d'un equip
export function focusPawn(k) {
  const p = pawns[k];
  if (!p) return;
  camFocus.x = p.position.x;
  camFocus.z = p.position.z;
  camFocus.k = 0.8;
}
export const debugCanvas = () => boardCanvas;
// per a proves amb la pestanya en segon pla (sense requestAnimationFrame)
export function renderOnce() { placeCamera(baseDist, camCur.x, camCur.z, camCur.k); renderer.render(scene, camera); }
export const isAnimating = () => animating.size > 0;
