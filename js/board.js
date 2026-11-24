// Dibuix del tauler, papers dels equips, fitxes i efectes visuals.
import {
  state, fx, sq, N, team, current, money, ownerOf, rentFor, rules, propsOf, canUndo,
} from './engine.js';
import { sfx } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

export const ICON = {
  dice: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="16" cy="16" r="1.4" fill="currentColor"/>',
  coins: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>',
  gavel: '<path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14"/><path d="m8 21 2-4M16 21l-2-4"/><circle cx="9" cy="13.5" r=".9" fill="currentColor"/><circle cx="15" cy="13.5" r=".9" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2"/>',
  expand: '<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  whistle: '<circle cx="9" cy="14" r="6"/><path d="M13 9.5 21 6v5l-6 1.5"/><circle cx="9" cy="14" r="1.6" fill="currentColor"/>',
  skip: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  arrowLeft: '<path d="M44 14H6M18 2 6 14l12 12"/>',
};
export const icon = (name, cls = '') => {
  const vb = name === 'arrowLeft' ? '0 0 48 28' : '0 0 24 24';
  return `<svg class="${cls}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
};
const HOUSE = '<svg class="house" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7v9H3z"/></svg>';
const HOTEL = '<svg class="house hotel" viewBox="0 0 36 24" aria-hidden="true"><path d="M2 10 18 3l16 7v11H2z"/></svg>';

// ---------- Fotos (només en aquest navegador) ----------
const photoCache = {};
export function photoOf(id) {
  if (!(id in photoCache)) {
    try { photoCache[id] = localStorage.getItem(`monopoli-cau-photo-${id}`) || ''; } catch { photoCache[id] = ''; }
  }
  return photoCache[id];
}
export function setPhoto(id, dataUrl) {
  photoCache[id] = dataUrl || '';
  try {
    if (dataUrl) localStorage.setItem(`monopoli-cau-photo-${id}`, dataUrl);
    else localStorage.removeItem(`monopoli-cau-photo-${id}`);
  } catch { toast("No s'ha pogut desar la foto (el navegador no té espai)."); }
}
export const initials = (n) => n.replace(/^Equip\s+/i, '').trim().slice(0, 2).toUpperCase() || '?';
export function avatarStyle(t) {
  const p = photoOf(t.id);
  return `--tc:${t.color};${p ? `background-image:url(${p});` : ''}`;
}
export const avatarText = (t) => (photoOf(t.id) ? '' : esc(initials(t.name)));

// ---------- Geometria del tauler ----------
const per = () => N() / 4;
function gridPos(i) {
  const p = per();
  if (i <= p) return { col: p + 1 - i, row: p + 1 };
  if (i <= 2 * p) return { col: 1, row: p + 1 - (i - p) };
  if (i <= 3 * p) return { col: 1 + (i - 2 * p), row: 1 };
  return { col: p + 1, row: 1 + (i - 3 * p) };
}
function sideOf(i) {
  const p = per();
  if (i % p === 0) return 'corner';
  if (i < p) return 'b';
  if (i < 2 * p) return 'l';
  if (i < 3 * p) return 't';
  return 'r';
}

// ---------- Construcció del tauler ----------
let boardEl;
export function buildBoard() {
  boardEl = $('#board');
  let html = '';
  for (let i = 0; i < N(); i++) html += `<button class="sq" type="button" data-sq="${i}"></button>`;
  html += `<div class="center" id="center">${topo()}
    <div class="logo"><b>Monopoli</b><span>del Cau</span></div>
    <div class="mid">
      <button class="deck deck-good" type="button" data-deck="good"><span>Cartes bones<small id="ngood"></small></span></button>
      <div class="turn" id="turn"></div>
      <button class="deck deck-bad" type="button" data-deck="bad"><span>Cartes dolentes<small id="nbad"></small></span></button>
    </div>
    <div class="controls" id="controls"></div>
  </div>
  <div class="tokens" id="tokens"></div>`;
  boardEl.innerHTML = html;
  boardEl.querySelectorAll('.sq').forEach((el) => {
    const i = Number(el.dataset.sq);
    const g = gridPos(i);
    el.style.gridArea = `${g.row} / ${g.col}`;
  });
  displayPos = null;
  renderSquares();
}

function topo() {
  // corbes de nivell, com un mapa d'excursió
  const rings = (cx, cy, n, rx, ry, rot) => Array.from({ length: n }, (_, k) => {
    const a = rx * (1 - k / (n + 0.6));
    const b = ry * (1 - k / (n + 0.6));
    const w = 0.12 + k * 0.03;
    return `<path transform="rotate(${rot} ${cx} ${cy})" d="M${cx - a} ${cy} C ${cx - a} ${cy - b * (1 + w)}, ${cx + a * (1 - w)} ${cy - b}, ${cx + a} ${cy} S ${cx - a * (0.6 + w)} ${cy + b * (1.1 + w)}, ${cx - a} ${cy} Z"/>`;
  }).join('');
  return `<svg class="topo" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    ${rings(150, 470, 7, 190, 120, -12)}${rings(470, 140, 6, 170, 110, 18)}${rings(520, 520, 4, 120, 70, 30)}${rings(90, 90, 3, 110, 60, -20)}
  </svg>`;
}

function squareHTML(i) {
  const s = sq(i);
  const side = sideOf(i);
  const o = state.owners[i];
  let inner = '';
  if (s.type === 'prop') {
    const h = o ? o.houses : 0;
    const houses = h === 5 ? HOTEL : HOUSE.repeat(h);
    inner = `<div class="band" style="--g:${state.config.groups[s.group]?.color || '#999'}">${houses}</div>
      <div class="sq-body"><div class="sq-name">${esc(s.name)}</div><div class="sq-price">${money(o && ownerOf(i) !== null ? rentFor(i) : s.price)}</div></div>`;
  } else if (s.type === 'station') {
    inner = `<div class="sq-body">${icon('train', 'sq-icon')}<div class="sq-name">${esc(s.name)}</div><div class="sq-price">${money(o ? rentFor(i) : s.price)}</div></div>`;
  } else if (s.type === 'chance') {
    inner = `<div class="sq-body"><div class="sq-big">?</div><div class="sq-name">${esc(s.name)}</div><div></div></div>`;
  } else if (s.type === 'tax') {
    inner = `<div class="sq-body">${icon('receipt', 'sq-icon')}<div class="sq-name">${esc(s.name)}</div><div class="sq-price">Paga ${money(s.amount)}</div></div>`;
  } else if (s.type === 'go') {
    inner = `<div class="corner-inner"><div class="sq-name">${esc(s.name)}</div><small>Cobra ${money(rules().goSalary)}</small>${icon('arrowLeft', 'arrow')}</div>`;
  } else if (s.type === 'jail') {
    inner = `<div class="jail-cell"><span>${esc(s.name)}</span></div><div class="visit">Només<br>de visita</div>`;
  } else if (s.type === 'parking') {
    inner = `<div class="corner-inner">${icon('coins', 'sq-icon')}<div class="sq-name">${esc(s.name)}</div>${rules().parkingPot ? `<div class="pot">Pot: ${money(state.pot)}</div>` : ''}</div>`;
  } else if (s.type === 'gotojail') {
    inner = `<div class="corner-inner">${icon('whistle', 'sq-icon')}<div class="sq-name">${esc(s.name)}</div></div>`;
  }
  if (o) {
    const t = team(o.team);
    inner += `<span class="own" style="--tc:${t.color}"></span><span class="own-badge" style="${avatarStyle(t)}">${avatarText(t)}</span>`;
  }
  const cornerCls = { go: 'c-go', jail: 'c-jail', parking: 'c-park', gotojail: 'c-gojail' }[s.type] || '';
  return { cls: `sq ${side === 'corner' ? `corner ${cornerCls}` : `side-${side}`}${o && o.mortgaged ? ' mort' : ''}`, inner, label: squareLabel(i) };
}

function squareLabel(i) {
  const s = sq(i);
  const o = state.owners[i];
  let l = s.name;
  if (s.price) l += o ? `, de ${team(o.team).name}` : `, preu ${money(s.price)}`;
  return l;
}

export function renderSquares() {
  boardEl.querySelectorAll('.sq').forEach((el) => {
    const i = Number(el.dataset.sq);
    const { cls, inner, label } = squareHTML(i);
    const extra = [...el.classList].filter((c) => c === 'pulse' || c === 'bought');
    if (el._html !== inner) { el.innerHTML = inner; el._html = inner; }
    el.className = [cls, ...extra].join(' ');
    el.setAttribute('aria-label', label);
  });
}

// ---------- Centre: torn i dau ----------
function dieFace(n) {
  const pos = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n];
  return pos.map((p) => `<span class="pip" style="grid-area:${Math.ceil(p / 3)} / ${((p - 1) % 3) + 1}"></span>`).join('');
}

export function renderCenter() {
  const T = current();
  const r = rules();
  $('#ngood').textContent = `queden ${state.decks.good.length}`;
  $('#nbad').textContent = `queden ${state.decks.bad.length}`;
  $('#turn').innerHTML = `<div class="turn-label">Torn de</div>
    <div class="turn-name" style="--tc:${T.color}">${esc(T.name)}</div>
    <div class="turn-sub">${state.lastRoll ? `Ha tret<span class="roll-num">${state.lastRoll}</span>` : `Ronda ${state.round}`}</div>`;

  const pending = state.queue.length > 0;
  const canRoll = state.phase === 'roll' && !pending;
  const faces = r.maxDie > 6
    ? Array.from({ length: r.maxDie - 1 }, (_, k) => k + 2)
    : [1, 2, 3, 4, 5, 6];
  const dice = faces.map((n) => {
    const isFace = r.maxDie <= 6;
    return `<button class="die${isFace ? '' : ' num'}${state.lastRoll === n && !canRoll ? ' is-last' : ''}" type="button" data-roll="${n}" ${canRoll ? '' : 'disabled'} aria-label="Ha sortit un ${n}">${isFace ? dieFace(n) : n}</button>`;
  }).join('');

  let prompt = '';
  let extra = '';
  if (pending) {
    prompt = 'Hi ha una acció pendent.';
    extra = '<button class="btn btn-primary btn-big" type="button" data-act="resume">Continuar</button>';
  } else if (state.phase === 'roll' && T.jail) {
    prompt = `${esc(T.name)} és a la presó (intent ${T.jailTurns + 1} de 3). Surt si treu un ${r.jailExitRoll}.`;
    extra = `<button class="btn" type="button" data-act="payjail">${icon('coins')}Pagar ${money(r.jailFine)} i sortir</button>
      ${T.jailCards ? `<button class="btn btn-good" type="button" data-act="jailcard">${icon('key')}Fer servir la carta</button>` : ''}`;
  } else if (state.phase === 'roll') {
    prompt = 'Tireu el dau gegant i marqueu el que ha sortit.';
  } else {
    prompt = '';
    extra = '<button class="btn btn-primary btn-big" type="button" data-act="endturn">Passar torn</button>';
  }
  $('#controls').innerHTML = `${prompt ? `<div class="prompt">${prompt}</div>` : ''}<div class="dice">${dice}</div>${extra ? `<div class="row">${extra}</div>` : ''}`;
}

// ---------- Fitxes ----------
let displayPos = null; // { [team]: { pos, jail } } el que es veu (pot anar per darrere de l'estat durant les animacions)

function spot(i, jailed) {
  const el = boardEl.querySelector(`[data-sq="${i}"]`);
  const x = el.offsetLeft;
  const y = el.offsetTop;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (sq(i).type === 'jail') {
    return jailed ? { x: x + w * 0.67, y: y + h * 0.33 } : { x: x + w * 0.24, y: y + h * 0.74 };
  }
  return { x: x + w / 2, y: y + h / 2 };
}

function tokenXY(t, overridePos) {
  const d = overridePos || displayPos[t];
  const base = spot(d.pos, d.jail);
  const same = state.teams.map((x, k) => k).filter((k) => !team(k).bankrupt && displayPos[k] && displayPos[k].pos === d.pos && !!displayPos[k].jail === !!d.jail);
  const n = same.length;
  const k = same.indexOf(t);
  const u = boardEl.offsetWidth / 9.4;
  let dx = 0;
  let dy = 0;
  if (n === 2) dx = (k === 0 ? -1 : 1) * u * 0.2;
  else if (n >= 3) { dx = (k % 2 ? 1 : -1) * u * 0.19; dy = (k < 2 ? -1 : 1) * u * 0.19; }
  return { x: base.x + dx, y: base.y + dy };
}

export function renderTokens() {
  const layer = $('#tokens');
  if (!displayPos) {
    displayPos = {};
    state.teams.forEach((t, k) => { displayPos[k] = { pos: t.pos, jail: t.jail }; });
  }
  state.teams.forEach((t, k) => {
    let el = layer.querySelector(`[data-token="${k}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'token';
      el.dataset.token = k;
      el.innerHTML = '<div class="shadow"></div><div class="piece"><div class="disc"></div></div>';
      layer.appendChild(el);
    }
    el.style.display = t.bankrupt ? 'none' : '';
    el.classList.toggle('is-turn', k === state.turn);
    const disc = el.querySelector('.disc');
    disc.setAttribute('style', avatarStyle(t));
    el.style.setProperty('--tc', t.color);
    disc.textContent = photoOf(t.id) ? '' : initials(t.name);
    if (!el._anim) {
      const p = tokenXY(k);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    }
  });
}

export function syncDisplay() {
  if (!displayPos) return;
  state.teams.forEach((t, k) => { displayPos[k] = { pos: t.pos, jail: t.jail }; });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function hop(k, toPos, jail, jump) {
  const el = $(`#tokens [data-token="${k}"]`);
  if (!el) return;
  const from = tokenXY(k);
  displayPos[k] = { pos: toPos, jail };
  const to = tokenXY(k);
  if (reduced()) {
    el.style.transform = `translate3d(${to.x}px, ${to.y}px, 0)`;
    return;
  }
  const u = boardEl.offsetWidth / 9.4;
  const h = jump ? u * 1.3 : u * 0.42;
  const dur = jump ? 650 : 220;
  el._anim = true;
  const a = el.animate([
    { transform: `translate3d(${from.x}px, ${from.y}px, 0)` },
    { transform: `translate3d(${to.x}px, ${to.y}px, 0)` },
  ], { duration: dur, easing: 'cubic-bezier(.45,0,.55,1)' });
  // el salt: la peça puja i baixa mentre l'ombra es queda a terra
  const piece = el.querySelector('.piece');
  const rest = getComputedStyle(piece).transform;
  const base = rest === 'none' ? '' : rest;
  piece.animate([
    { transform: `${base} translateY(0)` },
    { transform: `${base} translateY(${-h}px) scale(1.06)`, offset: 0.45 },
    { transform: `${base} translateY(0) scale(.94, 1.04)`, offset: 0.9 },
    { transform: `${base} translateY(0)` },
  ], { duration: dur, easing: 'ease-out' });
  el.querySelector('.shadow').animate([
    { transform: 'scale(1)', opacity: 1 },
    { transform: 'scale(.6)', opacity: 0.5, offset: 0.45 },
    { transform: 'scale(1)', opacity: 1 },
  ], { duration: dur });
  el.style.transform = `translate3d(${to.x}px, ${to.y}px, 0)`;
  sfx.hop();
  // si la pestanya queda en segon pla les animacions s'aturen: no deixem el joc encallat
  await Promise.race([a.finished.catch(() => {}), wait(dur + 120)]);
  el._anim = false;
}

// ---------- Papers dels equips ----------
const shownMoney = {};
export function renderTeams() {
  const L = $('#teamsL');
  const R = $('#teamsR');
  const html = (t, k) => {
    const props = propsOf(k);
    let chips = '';
    let lastG = null;
    props.forEach((i) => {
      const s = sq(i);
      const o = state.owners[i];
      const g = s.type === 'station' ? '__st' : s.group;
      if (lastG !== null && g !== lastG) chips += '<span class="chip-gap"></span>';
      lastG = g;
      const color = s.type === 'station' ? 'var(--ink)' : state.config.groups[s.group]?.color;
      chips += `<span class="chip${s.type === 'station' ? ' station' : ''}${o.mortgaged ? ' mort' : ''}" style="--g:${color}" title="${esc(s.name)}">${o.houses ? (o.houses === 5 ? 'H' : o.houses) : ''}</span>`;
    });
    const tags = [];
    if (t.bankrupt) tags.push('<span class="tag bad">En fallida</span>');
    if (t.jail) tags.push(`<span class="tag bad">${icon('lock')}A la presó</span>`);
    if (t.jailCards) tags.push(`<span class="tag good">${icon('key')}Surt de la presó${t.jailCards > 1 ? ` ×${t.jailCards}` : ''}</span>`);
    if (t.skip) tags.push(`<span class="tag bad">${icon('skip')}Perd ${t.skip > 1 ? `${t.skip} torns` : 'el torn'}</span>`);
    if (t.extra) tags.push(`<span class="tag good">${icon('dice')}Tirada extra</span>`);
    return `<button class="slip${k === state.turn ? ' is-turn' : ''}${t.bankrupt ? ' is-bankrupt' : ''}" type="button" data-team="${k}" style="--tc:${t.color}">
      <span class="slip-photo" style="${avatarStyle(t)}">${avatarText(t)}</span>
      <span class="slip-name">${esc(t.name)}</span>
      <span class="slip-money${t.money < 0 ? ' neg' : ''}" data-money="${k}">${money(shownMoney[k] ?? t.money)}</span>
      <span class="slip-props">${chips || '<span class="slip-empty">Encara sense propietats</span>'}</span>
      ${tags.length ? `<span class="slip-tags">${tags.join('')}</span>` : ''}
    </button>`;
  };
  const half = Math.ceil(state.teams.length / 2);
  L.innerHTML = state.teams.slice(0, half).map((t, k) => html(t, k)).join('');
  R.innerHTML = state.teams.slice(half).map((t, k) => html(t, k + half)).join('');
  state.teams.forEach((t, k) => tweenMoney(k, t.money));
}

function tweenMoney(k, target) {
  const el = $(`[data-money="${k}"]`);
  if (!el) return;
  const from = shownMoney[k] ?? target;
  if (from === target) { shownMoney[k] = target; el.textContent = money(target); return; }
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(target > from ? 'flash-up' : 'flash-down');
  if (reduced()) { shownMoney[k] = target; el.textContent = money(target); return; }
  const t0 = performance.now();
  const dur = 700;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - p) ** 3;
    const v = Math.round(from + (target - from) * e);
    const live = $(`[data-money="${k}"]`);
    if (live) live.textContent = money(v);
    if (p < 1) requestAnimationFrame(step);
    else shownMoney[k] = target;
  };
  shownMoney[k] = from;
  requestAnimationFrame(step);
  setTimeout(() => { shownMoney[k] = target; }, dur + 30);
}

// ---------- Barra ----------
export function renderBar(muted) {
  const last = state.log[0];
  $('#ticker').innerHTML = last ? `<i class="dot ${last.kind}"></i><span>${esc(last.text)}</span>` : '';
  $('#actions').innerHTML = `
    <button class="btn btn-primary" type="button" data-act="minigame">${icon('trophy')}Minijoc fet</button>
    <button class="btn" type="button" data-act="money">${icon('coins')}Diners</button>
    <button class="btn" type="button" data-act="trade">${icon('swap')}Intercanvi</button>
    <button class="btn" type="button" data-act="auction">${icon('gavel')}Subhasta</button>
    <span class="sep"></span>
    <button class="icon-btn" type="button" data-act="undo" ${canUndo() ? '' : 'disabled'} title="Desfer l'últim pas (Ctrl+Z)" aria-label="Desfer">${icon('undo')}</button>
    <button class="icon-btn" type="button" data-act="log" title="Historial" aria-label="Historial">${icon('list')}</button>
    <button class="icon-btn" type="button" data-act="mute" title="${muted ? 'Activar el so' : 'Silenciar'}" aria-label="${muted ? 'Activar el so' : 'Silenciar'}">${icon(muted ? 'mute' : 'volume')}</button>
    <button class="icon-btn" type="button" data-act="fullscreen" title="Pantalla completa" aria-label="Pantalla completa">${icon('expand')}</button>
    <button class="icon-btn" type="button" data-act="settings" title="Configuració" aria-label="Configuració">${icon('sliders')}</button>`;
}

// ---------- Efectes ----------
function rectCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
function anchor(who) {
  if (typeof who === 'number') {
    const el = $(`[data-money="${who}"]`) || $(`[data-team="${who}"]`);
    if (el) return rectCenter(el);
  }
  return rectCenter($('#turn'));
}

function flyMoney(from, to, amount) {
  if (reduced()) return;
  const layer = $('#fx');
  const a = anchor(from);
  const b = anchor(to);
  const el = document.createElement('div');
  const toTeam = typeof to === 'number';
  el.className = `fly ${toTeam ? 'good' : 'bad'}`;
  el.textContent = `${toTeam ? '+' : '−'}${money(amount)}`;
  layer.appendChild(el);
  const lift = Math.min(160, Math.abs(a.x - b.x) * 0.25 + 60);
  el.animate([
    { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
    { transform: `translate(${a.x}px, ${a.y - 30}px) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.15 },
    { transform: `translate(${(a.x + b.x) / 2}px, ${Math.min(a.y, b.y) - lift}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) scale(.8)`, opacity: 0 },
  ], { duration: 1100, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(() => el.remove());
}

export async function banner(text, tone = 'good', sub = '') {
  const b = $('#banner');
  b.className = `banner ${tone}`;
  b.innerHTML = `<div class="slab"><b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  void b.offsetWidth;
  b.classList.add('show');
  await wait(reduced() ? 400 : 1250);
}

export function confetti(color) {
  if (reduced()) return;
  const layer = $('#fx');
  const colors = [color, '#F2C31B', '#D8232F', '#2D7FF9', '#1F9D55', '#FBF6EA'];
  for (let k = 0; k < 90; k++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[k % colors.length];
    layer.appendChild(c);
    const drift = (Math.random() - 0.5) * 300;
    const rot = Math.random() * 900;
    c.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${window.innerHeight + 60}px) rotate(${rot}deg)`, opacity: 0.9 },
    ], { duration: 1800 + Math.random() * 1600, delay: Math.random() * 400, easing: 'cubic-bezier(.25,.6,.4,1)' })
      .finished.then(() => c.remove());
  }
}

function pulseSquare(i, cls = 'pulse') {
  const el = boardEl.querySelector(`[data-sq="${i}"]`);
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 1100);
}

let playing = false;
export const isPlaying = () => playing;

// Reprodueix els efectes que ha deixat el motor, en ordre.
export async function playFx() {
  if (playing) return;
  playing = true;
  try {
    while (fx.length) {
      const e = fx.shift();
      switch (e.type) {
        case 'move':
          for (let s = 0; s < e.path.length; s++) {
            const p = e.path[s];
            const last = s === e.path.length - 1;
            const jailed = last && team(e.team).jail && sq(p).type === 'jail';
            await hop(e.team, p, jailed, e.jump);
          }
          break;
        case 'land':
          pulseSquare(e.square);
          sfx.land();
          break;
        case 'money':
          flyMoney(e.from, e.to, e.amount);
          if (typeof e.to === 'number') sfx.cash(); else sfx.pay();
          renderTeams();
          await wait(reduced() ? 0 : 260);
          break;
        case 'buy':
          renderSquares();
          pulseSquare(e.square, 'bought');
          sfx.build();
          break;
        case 'build':
          renderSquares();
          pulseSquare(e.square, 'bought');
          sfx.build();
          break;
        case 'banner':
          if (/presó/i.test(e.text)) sfx.jail();
          else if (e.tone === 'good') sfx.good();
          await banner(e.text, e.tone, e.sub);
          break;
        case 'confetti':
          confetti(team(e.team).color);
          sfx.good();
          break;
        case 'turn':
          break;
        default:
          break;
      }
    }
  } finally {
    playing = false;
  }
}

// ---------- Avisos ----------
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3800);
}

export function renderAll(muted) {
  renderSquares();
  renderCenter();
  renderTeams();
  renderTokens();
  renderBar(muted);
}
