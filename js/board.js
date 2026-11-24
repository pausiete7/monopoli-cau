// Interfície al voltant del tauler: equips, barra de torns, safata del dau i efectes.
import { state, fx, sq, team, current, money, propsOf, canUndo, rules } from './engine.js?v=1795556498';
import * as S3 from './scene.js?v=1795556498';
import { sfx } from './sound.js?v=1795556498';
import { esc, photoOf, avatarStyle, avatarText } from './util.js?v=1795556498';

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
      <button class="icon-btn icon-btn-text" type="button" data-act="finish" title="Acabar la partida i veure qui guanya">${icon('trophy')}<span>Acabar</span></button>
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
  if (state.winner !== undefined && team(state.winner)) {
    const W = team(state.winner);
    main = `<div class="dock-msg">Partida acabada</div>
      <div class="winner" style="--tc:${W.color}"><span class="tc-av" style="${avatarStyle(W)}">${avatarText(W)}</span><b>Guanya ${esc(W.name)}!</b></div>
      <button class="gbtn gbtn-primary gbtn-xl" type="button" data-act="restart">Nova partida</button>`;
  } else if (!state.started) {
    main = `<div class="dock-msg">La partida encara no ha començat</div><button class="gbtn gbtn-primary gbtn-xl" type="button" data-act="setup">Preparar la partida</button>`;
  } else if (pending) {
    main = `<div class="dock-msg">Hi ha una acció pendent</div><button class="gbtn gbtn-primary gbtn-xl" type="button" data-act="resume">Continuar</button>`;
  } else if (state.phase === 'roll') {
    const faces = r.maxDie > 6 ? Array.from({ length: r.maxDie - 1 }, (_, k) => k + 2) : [1, 2, 3, 4, 5, 6];
    const dice = faces.map((n) => `<button class="die${r.maxDie > 6 ? ' num' : ''}" type="button" data-roll="${n}" aria-label="Ha sortit un ${n}">${r.maxDie > 6 ? n : dieFace(n)}</button>`).join('');
    const max = r.jailMaxTurns || 3;
    const how = r.jailRoll ? `Surt si treu un ${r.jailExitRoll}.` : 'Ha de tirar igualment.';
    const jail = T.jail
      ? `<div class="jail-opts"><span>A la presó, torn ${T.jailTurns + 1} de ${max}. ${how}</span>
          ${r.jailPay ? `<button class="gbtn gbtn-sm" type="button" data-act="payjail" ${T.money < r.jailFine ? 'disabled title="No té prou diners"' : ''}>${icon('coins')}Pagar ${money(r.jailFine)}</button>` : ''}
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
      <button class="gbtn gbtn-primary gbtn-wide" type="button" data-act="minigame" ${state.queue.length ? 'disabled title="Primer cal resoldre l\'acció pendent"' : ''}>${icon('trophy')}Minijoc fet</button>
      <button class="gbtn" type="button" data-act="money">${icon('coins')}Diners</button>
      <button class="gbtn" type="button" data-act="trade">${icon('swap')}Intercanvi</button>
      <button class="gbtn gbtn-wide" type="button" data-act="auction">${icon('gavel')}Subhasta</button>
    </nav>
    <button class="ticker" id="ticker" type="button" title="Obrir l'historial">${last ? `<i class="dot ${last.kind}"></i><span>${esc(last.text)}</span>` : ''}</button>`;
}
export const renderCenter = renderDock;

// ---------- Targetes dels equips ----------
const shownMoney = {};
export function renderTeams(opts = {}) {
  const html = (t, k) => {
    // títols de propietat en miniatura, posats un al costat de l'altre com damunt la taula
    // sense solapar-se: fins a 5 en una fila; si n'hi ha més, dues files i una mica més petits
    const props = propsOf(k);
    const n = props.length;
    const size = n <= 5 ? 'lg' : n <= 10 ? 'md' : 'sm';
    const chips = props.map((i) => {
      const s = sq(i);
      const o = state.owners[i];
      const color = s.type === 'station' ? '#2A2C5E' : state.config.groups[s.group]?.color;
      const light = s.group === 'groc' || s.group === 'cel';
      const houses = o.houses === 5 ? '<i class="h hotel"></i>' : '<i class="h"></i>'.repeat(o.houses || 0);
      const rot = ((i * 37) % 7) - 3;
      const key = `${k}:${i}`;
      const fresh = seenDeeds.ready && !seenDeeds.has(key);
      seenDeeds.add(key);
      return `<span class="mdeed ${size}${fresh ? ' new' : ''}${o.mortgaged ? ' mort' : ''}${s.type === 'station' ? ' st' : ''}" style="--g:${color};--r:${rot}deg" title="${esc(s.name)}" lang="ca">
        <b class="${light ? 'light' : ''}">${houses}</b><em>${esc(s.name)}</em>${o.mortgaged ? '<small>Hipotecada</small>' : ''}</span>`;
    }).join('');
    const tags = [];
    if (t.bankrupt) tags.push('<span class="tag bad">En fallida: fora de la partida</span>');
    if (!t.bankrupt && t.money < 0) tags.push('<span class="tag bad">En negatiu: ha de vendre o hipotecar</span>');
    if (state.winner === k) tags.push(`<span class="tag good">${icon('trophy')}Guanyador</span>`);
    if (t.jail) tags.push(`<span class="tag bad">${icon('lock')}A la presó</span>`);
    if (t.jailCards) tags.push(`<span class="tag good">${icon('key')}Surt de la presó${t.jailCards > 1 ? ` ×${t.jailCards}` : ''}</span>`);
    if (t.skip) tags.push(`<span class="tag bad">${icon('skip')}Perd ${t.skip > 1 ? `${t.skip} torns` : 'el torn'}</span>`);
    if (t.extra) tags.push(`<span class="tag good">${icon('dice')}Tirada extra</span>`);
    return `<button class="tcard${k === state.turn ? ' is-turn' : ''}${t.bankrupt ? ' is-out' : ''}" type="button" data-team="${k}" style="--tc:${t.color}">
      <span class="tc-head"><span class="tc-av" style="${avatarStyle(t)}">${avatarText(t)}</span><span class="tc-name">${esc(t.name)}</span></span>
      <span class="tc-money${t.money < 0 ? ' neg' : ''}" data-money="${k}">${money(shownMoney[k] ?? t.money)}</span>
      <span class="tc-props">${chips || '<span class="tc-empty">Encara no té cap propietat</span>'}</span>
      ${tags.length ? `<span class="tc-tags">${tags.join('')}</span>` : ''}
    </button>`;
  };
  const half = Math.ceil(state.teams.length / 2);
  // les propietats que ja no són d'un equip s'obliden (així tornen a entrar animades si les recupera)
  [...seenDeeds].forEach((key) => { const [k, i] = key.split(':').map(Number); if (state.owners[i]?.team !== k) seenDeeds.delete(key); });
  $('#teamsL').innerHTML = state.teams.slice(0, half).map((t, k) => html(t, k)).join('');
  $('#teamsR').innerHTML = state.teams.slice(half).map((t, k) => html(t, k + half)).join('');
  seenDeeds.ready = true;
  state.teams.forEach((t, k) => tweenMoney(k, k === opts.hold ? t.money - opts.amount : t.money));
}
const seenDeeds = new Set();

const tweenToken = {};
function tweenMoney(k, target) {
  const el = $(`[data-money="${k}"]`);
  if (!el) return;
  const from = shownMoney[k] ?? target;
  if (from === target) { if (!tweenToken[k + 'run']) el.textContent = money(target); shownMoney[k] = target; return; }
  const token = (tweenToken[k] = (tweenToken[k] || 0) + 1); // un compte nou anul·la l'anterior
  el.classList.remove('flash-up', 'flash-down');
  void el.offsetWidth;
  el.classList.add(target > from ? 'flash-up' : 'flash-down');
  shownMoney[k] = target;
  if (reduced()) { el.textContent = money(target); return; }
  const t0 = performance.now();
  const dur = 1400;
  tweenToken[k + 'run'] = true;
  const step = (now) => {
    if (tweenToken[k] !== token) return;
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - p) ** 3;
    const live = $(`[data-money="${k}"]`);
    if (live) live.textContent = money(Math.round(from + (target - from) * e));
    if (p < 1) requestAnimationFrame(step); else tweenToken[k + 'run'] = false;
  };
  requestAnimationFrame(step);
  setTimeout(() => {
    if (tweenToken[k] !== token) return;
    tweenToken[k + 'run'] = false;
    const live = $(`[data-money="${k}"]`);
    if (live) live.textContent = money(target);
  }, dur + 80);
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

// bitllets de la banca: valor, color i color fosc de la vora
const BILLS = [
  { v: 500, c: '#C9A7F5', d: '#6B3FB5' },
  { v: 100, c: '#FFC27A', d: '#B8650E' },
  { v: 50, c: '#9DCCF5', d: '#2A6FB0' },
  { v: 20, c: '#9BE3AE', d: '#1E8A47' },
  { v: 10, c: '#FFEC8A', d: '#A88A00' },
  { v: 5, c: '#F9B4D0', d: '#B83A72' },
  { v: 1, c: '#F2F4FA', d: '#7A80A0' },
];

function flyMoney(from, to, amount) {
  if (reduced()) return;
  const layer = $('#fx');
  const a = anchor(from);
  const b = anchor(to);
  const toTeam = typeof to === 'number';
  // els bitllets que sumen la quantitat (com a mínim un), cadascun del seu color
  const notes = [];
  let rest = Math.abs(amount);
  for (const d of BILLS) {
    while (rest >= d.v && notes.length < 9) { notes.push(d); rest -= d.v; }
  }
  if (!notes.length) notes.push(BILLS[BILLS.length - 1]);
  const n = notes.length;
  for (let k = 0; k < n; k++) {
    const el = document.createElement('div');
    el.className = 'bill';
    el.style.setProperty('--bc', notes[k].c);
    el.style.setProperty('--bd', notes[k].d);
    el.innerHTML = `<span>${notes[k].v}</span>`;
    layer.appendChild(el);
    const lift = 120 + Math.random() * 80;
    const jitter = (Math.random() - 0.5) * 60;
    el.animate([
      { transform: `translate(${a.x}px, ${a.y}px) translate(-50%, -50%) rotate(0deg) scale(.5)`, opacity: 0 },
      { transform: `translate(${a.x + jitter}px, ${a.y - 40}px) translate(-50%, -50%) rotate(${jitter}deg) scale(1)`, opacity: 1, offset: 0.15 },
      { transform: `translate(${(a.x + b.x) / 2 + jitter}px, ${Math.min(a.y, b.y) - lift}px) translate(-50%, -50%) rotate(${jitter * 4}deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${b.x}px, ${b.y}px) translate(-50%, -50%) rotate(${jitter * 6}deg) scale(.6)`, opacity: 0 },
    ], { duration: 1900, delay: k * 150, easing: 'cubic-bezier(.4,0,.2,1)' }).finished.then(() => el.remove());
  }
  // etiqueta de quant: −X a qui paga i +X a qui cobra (quan arriben els bitllets)
  const tag = (pos, good, delay) => {
    const label = document.createElement('div');
    label.className = `fly ${good ? 'good' : 'bad'}`;
    label.textContent = `${good ? '+' : '−'}${money(amount)}`;
    layer.appendChild(label);
    label.animate([
      { transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
      { transform: `translate(${pos.x}px, ${pos.y - 50}px) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${pos.x}px, ${pos.y - 70}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${pos.x}px, ${pos.y - 90}px) translate(-50%, -50%) scale(.9)`, opacity: 0 },
    ], { duration: 2600, delay, fill: 'backwards', easing: 'ease-out' }).finished.then(() => label.remove());
  };
  if (typeof from === 'number') tag(a, false, 0);
  if (toTeam) tag(b, true, 1300 + n * 100);
}
export const moneyDuration = (amount) => {
  let n = 0; let rest = Math.abs(amount);
  for (const d of BILLS) while (rest >= d.v && n < 9) { n++; rest -= d.v; }
  return 1900 + Math.max(1, n) * 150;
};

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
        case 'money': {
          flyMoney(e.from, e.to, e.amount);
          const both = typeof e.from === 'number' && typeof e.to === 'number';
          if (typeof e.from === 'number') sfx.pay();
          // qui paga baixa de seguida; qui cobra puja quan li arriben els bitllets
          renderTeams({ hold: typeof e.to === 'number' ? e.to : null, amount: e.amount });
          const dur = moneyDuration(e.amount);
          if (typeof e.to === 'number') setTimeout(() => { sfx.cash(); renderTeams(); }, reduced() ? 0 : dur - 500);
          // el lloguer entre equips es veu sencer abans de continuar; la resta, una mica més ràpid
          await wait(reduced() ? 0 : both ? dur + 300 : Math.min(1400, dur * 0.6));
          break;
        }
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
          else if (/fallida/i.test(e.text)) sfx.bankrupt();
          else if (/^guanya/i.test(e.text)) sfx.winner();
          else if (/adjudicat/i.test(e.text)) sfx.gavel();
          else if (/multa/i.test(e.text)) sfx.stamp();
          else if (e.tone === 'good') sfx.good();
          await banner(e.text, e.tone, e.sub);
          break;
        case 'confetti':
          confetti(team(e.team).color);
          sfx.good();
          break;
        case 'turn':
          // canvi de torn: la càmera va a la seva fitxa, apareix el halo i passa la franja
          S3.setTurn(e.team);
          renderTop(isMutedFlag());
          renderTeams();
          S3.focusPawn(e.team);
          sfx.turn?.();
          await turnBand(team(e.team));
          S3.focus(false);
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

export const drawCardFx = (deck, card) => S3.drawCard(deck, card);

// franja que creua la pantalla: «Li toca a …»
let mutedRef = () => false;
export const setMutedRef = (fn) => { mutedRef = fn; };
const isMutedFlag = () => mutedRef();
async function turnBand(T) {
  if (reduced()) return;
  const el = document.createElement('div');
  el.className = 'turnband';
  el.style.setProperty('--tc', T.color);
  el.innerHTML = `<div class="tb-in"><span class="tb-av" style="${avatarStyle(T)}">${avatarText(T)}</span><span class="tb-txt"><small>Li toca a</small><b>${esc(T.name)}</b></span></div>`;
  $('#fx').appendChild(el);
  const a = el.animate([
    { transform: 'translateX(-110%) skewX(-12deg)', opacity: 0 },
    { transform: 'translateX(0) skewX(-12deg)', opacity: 1, offset: 0.22 },
    { transform: 'translateX(3%) skewX(-12deg)', opacity: 1, offset: 0.78 },
    { transform: 'translateX(115%) skewX(-12deg)', opacity: 0 },
  ], { duration: 1500, easing: 'cubic-bezier(.3,.8,.3,1)' });
  await Promise.race([a.finished.catch(() => {}), wait(1700)]);
  el.remove();
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
  S3.refresh(false);
  S3.setTurn(state.turn);
  renderTop(muted);
  renderTeams();
  renderDock();
}

export { photoOf, avatarStyle, avatarText };
