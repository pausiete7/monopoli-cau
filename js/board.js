// Interfície al voltant del tauler: equips, barra de torns, safata del dau i efectes.
import { state, fx, sq, team, current, money, propsOf, canUndo, rules } from './engine.js';
import * as S3 from './scene.js';
import { sfx } from './sound.js';
import { esc, photoOf, avatarStyle, avatarText } from './util.js';

export { esc };
const $ = (s, r = document) => r.querySelector(s);
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14.5 8.5l2 2"/>',
  expand: '<path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  skip: '<circle cx="12" cy="12" r="9"/><path d="M8 8l8 8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
};
export const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

// ---------- Tauler 3D ----------
let handlers = {};
export function buildBoard(h) {
  if (h) handlers = h;
  if (!buildBoard.inited) {
    S3.initScene($('#stage'), handlers);
    buildBoard.inited = true;
  } else S3.buildBoard();
}
export const syncDisplay = () => S3.syncDisplay();
export const renderTokens = () => S3.refresh(false);
export const renderSquares = () => S3.refresh(false);

// ---------- Barra superior: ronda i ordre de torns ----------
export function renderTop(muted) {
  const order = state.teams.map((t, k) => {
    const cls = [k === state.turn ? 'is-turn' : '', t.bankrupt ? 'is-out' : ''].join(' ');
    return `<li class="ord ${cls}" style="--tc:${t.color}"><span class="ord-av" style="${avatarStyle(t)}">${avatarText(t)}</span><span class="ord-name">${esc(t.name)}</span></li>`;
  }).join('');
  $('#top').innerHTML = `
    <div class="round"><span>Ronda</span><b>${state.round}</b></div>
    <ol class="order" aria-label="Ordre dels torns">${order}</ol>
    <div class="tools">
      <button class="icon-btn" type="button" data-act="undo" ${canUndo() ? '' : 'disabled'} title="Desfer l'últim pas (Ctrl+Z)" aria-label="Desfer">${icon('undo')}</button>
      <button class="icon-btn" type="button" data-act="log" title="Historial" aria-label="Historial">${icon('list')}</button>
      <button class="icon-btn" type="button" data-act="mute" title="${muted ? 'Activar el so' : 'Silenciar'}" aria-label="${muted ? 'Activar el so' : 'Silenciar'}">${icon(muted ? 'mute' : 'volume')}</button>
      <button class="icon-btn" type="button" data-act="fullscreen" title="Pantalla completa" aria-label="Pantalla completa">${icon('expand')}</button>
      <button class="icon-btn icon-btn-text" type="button" data-act="restart" title="Reiniciar la partida">${icon('restart')}<span>Reiniciar</span></button>
      <button class="icon-btn" type="button" data-act="settings" title="Configuració" aria-label="Configuració">${icon('sliders')}</button>
    </div>`;
}

// ---------- Safata inferior: dau i accions ----------
function dieFace(n) {
  const pos = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n];
  return pos.map((p) => `<span class="pip" style="grid-area:${Math.ceil(p / 3)} / ${((p - 1) % 3) + 1}"></span>`).join('');
}

export function renderDock() {
  const T = current();
  const r = rules();
  const pending = state.queue.length > 0;
  let main = '';
  if (!state.started) {
    main = `<div class="dock-msg">La partida encara no ha començat</div><button class="gbtn gbtn-primary gbtn-xl" type="button" data-act="setup">Preparar la partida</button>`;
  } else if (pending) {
    main = `<div class="dock-msg">Hi ha una acció pendent</div><button class="gbtn gbtn-primary gbtn-xl" type="button" data-act="resume">Continuar</button>`;
  } else if (state.phase === 'roll') {
    const faces = r.maxDie > 6 ? Array.from({ length: r.maxDie - 1 }, (_, k) => k + 2) : [1, 2, 3, 4, 5, 6];
    const dice = faces.map((n) => `<button class="die${r.maxDie > 6 ? ' num' : ''}" type="button" data-roll="${n}" aria-label="Ha sortit un ${n}">${r.maxDie > 6 ? n : dieFace(n)}</button>`).join('');
    const jail = T.jail
      ? `<div class="jail-opts"><span>A la presó: surt amb un ${r.jailExitRoll} (intent ${T.jailTurns + 1} de 3)</span>
          <button class="gbtn gbtn-sm" type="button" data-act="payjail">${icon('coins')}Pagar ${money(r.jailFine)}</button>
          ${T.jailCards ? `<button class="gbtn gbtn-sm gbtn-good" type="button" data-act="jailcard">${icon('key')}Fer servir la carta</button>` : ''}</div>`
      : '';
    main = `<div class="dock-msg">Quin número ha sortit?</div><div class="dice">${dice}</div>${jail}`;
  } else {
    main = `<div class="dock-msg">${state.lastRoll ? `Ha sortit un <b>${state.lastRoll}</b>` : ''}</div>
      <button class="gbtn gbtn-xl gbtn-turn" type="button" data-act="endturn" style="--tc:${T.color}">Passar torn${icon('next')}</button>
      <div class="dock-sub">o premeu Enter</div>`;
  }
  const last = state.log[0];
  $('#dock').innerHTML = `<div class="dock-main">${main}</div>`;
  $('#actions').innerHTML = `
    <nav class="actions" aria-label="Accions">
      <button class="gbtn gbtn-primary gbtn-wide" type="button" data-act="minigame">${icon('trophy')}Minijoc fet</button>
      <button class="gbtn" type="button" data-act="money">${icon('coins')}Diners</button>
      <button class="gbtn" type="button" data-act="trade">${icon('swap')}Intercanvi</button>
      <button class="gbtn gbtn-wide" type="button" data-act="auction">${icon('gavel')}Subhasta</button>
    </nav>
    <button class="ticker" id="ticker" type="button" title="Obrir l'historial">${last ? `<i class="dot ${last.kind}"></i><span>${esc(last.text)}</span>` : ''}</button>`;
}
export const renderCenter = renderDock;

// ---------- Targetes dels equips ----------
const shownMoney = {};
export function renderTeams() {
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
      const color = s.type === 'station' ? '#2A2C5E' : state.config.groups[s.group]?.color;
      chips += `<span class="chip${o.mortgaged ? ' mort' : ''}" style="--g:${color}" title="${esc(s.name)}">${o.houses ? (o.houses === 5 ? 'H' : o.houses) : ''}</span>`;
    });
    const tags = [];
    if (t.bankrupt) tags.push('<span class="tag bad">En fallida</span>');
    if (t.jail) tags.push(`<span class="tag bad">${icon('lock')}A la presó</span>`);
    if (t.jailCards) tags.push(`<span class="tag good">${icon('key')}Surt de la presó${t.jailCards > 1 ? ` ×${t.jailCards}` : ''}</span>`);
    if (t.skip) tags.push(`<span class="tag bad">${icon('skip')}Perd ${t.skip > 1 ? `${t.skip} torns` : 'el torn'}</span>`);
    if (t.extra) tags.push(`<span class="tag good">${icon('dice')}Tirada extra</span>`);
    return `<button class="tcard${k === state.turn ? ' is-turn' : ''}${t.bankrupt ? ' is-out' : ''}" type="button" data-team="${k}" style="--tc:${t.color}">
      <span class="tc-head"><span class="tc-av" style="${avatarStyle(t)}">${avatarText(t)}</span><span class="tc-name">${esc(t.name)}</span></span>
      <span class="tc-money${t.money < 0 ? ' neg' : ''}" data-money="${k}">${money(shownMoney[k] ?? t.money)}</span>
      <span class="tc-props">${chips || '<span class="tc-empty">Sense propietats</span>'}</span>
      ${tags.length ? `<span class="tc-tags">${tags.join('')}</span>` : ''}
    </button>`;
  };
  const half = Math.ceil(state.teams.length / 2);
  $('#teamsL').innerHTML = state.teams.slice(0, half).map((t, k) => html(t, k)).join('');
  $('#teamsR').innerHTML = state.teams.slice(half).map((t, k) => html(t, k + half)).join('');
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
  const dur = 800;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - p) ** 3;
    const live = $(`[data-money="${k}"]`);
    if (live) live.textContent = money(Math.round(from + (target - from) * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  shownMoney[k] = target;
  setTimeout(() => { const live = $(`[data-money="${k}"]`); if (live) live.textContent = money(state.teams[k]?.money ?? target); }, dur + 60);
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
  return rectCenter($('#stage'));
}

function flyMoney(from, to, amount) {
  if (reduced()) return;
  const layer = $('#fx');
  const a = anchor(from);
  const b = anchor(to);
  const toTeam = typeof to === 'number';
  // uns quants bitllets que volen en corba
  const n = Math.min(6, 2 + Math.floor(amount / 100));
  for (let k = 0; k < n; k++) {
    const el = document.createElement('div');
    el.className = 'bill';
    layer.appendChild(el);
    const lift = 120 + Math.random() * 80;
    const jitter = (Math.random() - 0.5) * 60;
    el.animate([
      { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) rotate(0deg) scale(.5)`, opacity: 0 },
      { transform: `translate(${a.x + jitter}px, ${a.y - 40}px) translate(-50%, -50%) rotate(${jitter}deg) scale(1)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${(a.x + b.x) / 2 + jitter}px, ${Math.min(a.y, b.y) - lift}px) translate(-50%, -50%) rotate(${jitter * 4}deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) rotate(${jitter * 6}deg) scale(.6)`, opacity: 0 },
    ], { duration: 1000, delay: k * 70, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(() => el.remove());
  }
  const label = document.createElement('div');
  label.className = `fly ${toTeam ? 'good' : 'bad'}`;
  label.textContent = `${toTeam ? '+' : '−'}${money(amount)}`;
  layer.appendChild(label);
  const end = toTeam ? b : a;
  label.animate([
    { transform: `translate(${end.x}px, ${end.y}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
    { transform: `translate(${end.x}px, ${end.y - 50}px) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${end.x}px, ${end.y - 70}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.8 },
    { transform: `translate(${end.x}px, ${end.y - 90}px) translate(-50%, -50%) scale(.9)`, opacity: 0 },
  ], { duration: 1500, delay: toTeam ? 600 : 0, fill: 'backwards', easing: 'ease-out' }).finished.then(() => label.remove());
}

export async function banner(text, tone = 'good', sub = '') {
  const b = $('#banner');
  b.className = `banner ${tone}`;
  b.innerHTML = `<div class="slab"><b>${esc(text)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  void b.offsetWidth;
  b.classList.add('show');
  await wait(reduced() ? 400 : 1300);
}

export function confetti(color) {
  if (reduced()) return;
  const layer = $('#fx');
  const colors = [color, '#FFD84D', '#E8473B', '#2D7FF9', '#35B865', '#FFFFFF'];
  for (let k = 0; k < 110; k++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = colors[k % colors.length];
    layer.appendChild(c);
    const drift = (Math.random() - 0.5) * 320;
    c.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px, ${window.innerHeight + 60}px) rotate(${Math.random() * 900}deg)`, opacity: 0.9 },
    ], { duration: 1800 + Math.random() * 1600, delay: Math.random() * 400, easing: 'cubic-bezier(.25,.6,.4,1)' })
      .finished.then(() => c.remove());
  }
}

let playing = false;
export const isPlaying = () => playing;

export async function playFx() {
  if (playing) return;
  playing = true;
  try {
    while (fx.length) {
      const e = fx.shift();
      switch (e.type) {
        case 'move': {
          S3.focus(true);
          for (let s = 0; s < e.path.length; s++) {
            const p = e.path[s];
            const last = s === e.path.length - 1;
            const jailed = last && team(e.team).jail && sq(p).type === 'jail';
            await S3.hop(e.team, p, jailed, { jump: e.jump, onStep: () => sfx.hop() });
          }
          if (fx[0]?.type !== 'land') S3.focus(false);
          break;
        }
        case 'land':
          S3.pulse(e.square);
          sfx.land();
          setTimeout(() => S3.focus(false), 350);
          await wait(reduced() ? 0 : 250);
          break;
        case 'money':
          flyMoney(e.from, e.to, e.amount);
          if (typeof e.to === 'number') sfx.cash(); else sfx.pay();
          renderTeams();
          await wait(reduced() ? 0 : 320);
          break;
        case 'buy':
          S3.refresh(true);
          S3.pulse(e.square, 0xFFFFFF);
          sfx.build();
          await wait(reduced() ? 0 : 450);
          break;
        case 'build':
          S3.refresh(true);
          sfx.build();
          await wait(reduced() ? 0 : 650);
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
        default:
          break;
      }
    }
  } finally {
    playing = false;
    S3.focus(false);
  }
}

export const drawCardFx = (deck) => S3.drawCard(deck);

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
  S3.refresh(false);
  S3.setTurn(state.turn);
  renderTop(muted);
  renderTeams();
  renderDock();
}

export { photoOf, avatarStyle, avatarText };
