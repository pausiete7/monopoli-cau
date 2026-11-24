// Motor del joc: estat, regles i desfer. No toca el DOM.
import { BOARD, CARDS, TEAMS, RULES, GROUPS } from './data.js?v=1795549094';

const KEY = 'monopoli-cau-v1';
const UNDO_KEY = 'monopoli-cau-undo-v1';
const UNDO_MAX = 80;

export let state = null;
let undoStack = [];
export const fx = []; // efectes visuals pendents (els consumeix la UI)

const clone = (o) => JSON.parse(JSON.stringify(o));
const range = (n) => [...Array(n).keys()];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ple o bloquejat */ }
}
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function save() {
  store(KEY, JSON.stringify(state));
  store(UNDO_KEY, JSON.stringify(undoStack));
}

export function load() {
  const raw = read(KEY);
  if (raw) {
    try {
      state = JSON.parse(raw);
      undoStack = JSON.parse(read(UNDO_KEY) || '[]');
      migrate();
      return true;
    } catch { /* estat trencat: en comencem un de nou */ }
  }
  newGame();
  return false;
}

function migrate() {
  state.config.rules = { ...RULES, ...state.config.rules };
  if (state.config.rules.badName === 'Mal Rotllo') state.config.rules.badName = RULES.badName;
  state.config.groups = state.config.groups || clone(GROUPS);
  state.queue = state.queue || [];
  state.started ??= state.log.length > 0;
  state.teams.forEach((t) => { t.skip ??= 0; t.extra ??= 0; t.jailCards ??= 0; });
}

export function defaultConfig() {
  return { board: clone(BOARD), cards: clone(CARDS), rules: clone(RULES), groups: clone(GROUPS) };
}

export function newGame(config = state?.config || defaultConfig(), teams = state?.teams || TEAMS) {
  state = {
    v: 1,
    config: clone(config),
    teams: teams.map((t) => ({
      id: t.id, name: t.name, color: t.color,
      money: config.rules.startMoney, pos: 0,
      jail: false, jailTurns: 0, jailCards: 0, skip: 0, extra: 0, bankrupt: false,
    })),
    owners: {},
    turn: 0,
    phase: 'roll', // roll | end
    lastRoll: null,
    decks: { good: shuffle(range(config.cards.good.length)), bad: shuffle(range(config.cards.bad.length)) },
    queue: [],
    pot: 0,
    round: 1,
    log: [],
    started: false,
  };
  undoStack = [];
  fx.length = 0;
  save();
}

// Pantalla de preparació: noms, colors i diners abans de la primera tirada
export function startGame({ teams, rules: r }) {
  Object.assign(state.config.rules, r);
  state.log = state.log.filter((l) => !/^Comença la partida/.test(l.text));
  state.teams.forEach((t, k) => {
    t.name = teams[k].name.trim() || t.name;
    t.color = teams[k].color;
    t.money = state.config.rules.startMoney;
  });
  state.started = true;
  log('Comença la partida. Sort a tots els equips!', 'info');
  save();
}

// ---------- Utilitats de lectura ----------
export const cfg = () => state.config;
export const rules = () => state.config.rules;
export const sq = (i) => state.config.board[i];
export const N = () => state.config.board.length;
export const team = (i) => state.teams[i];
export const current = () => state.teams[state.turn];
export const money = (n) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ca-ES')} ${rules().currency}`;
export const isBuyable = (i) => ['prop', 'station'].includes(sq(i).type);
export const ownerOf = (i) => (state.owners[i] ? state.owners[i].team : null);
export const groupSquares = (g) => state.config.board.map((s, i) => (s.group === g ? i : -1)).filter((i) => i >= 0);
export const ownsGroup = (t, g) => groupSquares(g).every((i) => ownerOf(i) === t);
export const propsOf = (t) => Object.keys(state.owners).map(Number).filter((i) => state.owners[i].team === t).sort((a, b) => a - b);
export const activeTeams = () => state.teams.map((t, i) => i).filter((i) => !state.teams[i].bankrupt);
export const jailIndex = () => state.config.board.findIndex((s) => s.type === 'jail');
export const canUndo = () => undoStack.length > 0;

export function rentFor(i) {
  const o = state.owners[i];
  if (!o || o.mortgaged) return 0;
  const s = sq(i);
  if (s.type === 'station') {
    const n = state.config.board.filter((x, j) => x.type === 'station' && ownerOf(j) === o.team).length;
    return rules().stationRent[Math.max(0, n - 1)] || 0;
  }
  if (o.houses > 0) return s.rent[o.houses];
  return s.rent[0] * (ownsGroup(o.team, s.group) ? 2 : 1);
}

export function netWorth(t) {
  let w = team(t).money;
  propsOf(t).forEach((i) => {
    const o = state.owners[i];
    const s = sq(i);
    w += o.mortgaged ? s.price / 2 : s.price;
    if (o.houses) w += o.houses * (s.house || 0);
  });
  return w;
}

// ---------- Registre, desfer i efectes ----------
export function log(text, kind = 'info') {
  state.log.unshift({ t: Date.now(), text, kind });
  if (state.log.length > 200) state.log.length = 200;
}

function checkpoint() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > UNDO_MAX) undoStack.shift();
}

export function undo() {
  if (!undoStack.length) return false;
  state = JSON.parse(undoStack.pop());
  fx.length = 0;
  save();
  return true;
}

const push = (e) => fx.push(e);

// from / to: índex d'equip, 'bank' o 'pot'
function transfer(from, to, amount, reason) {
  if (!amount) return;
  if (to === 'bank' && rules().parkingPot) to = 'pot';
  if (typeof from === 'number') team(from).money -= amount;
  else if (from === 'pot') state.pot -= amount;
  if (typeof to === 'number') team(to).money += amount;
  else if (to === 'pot') state.pot += amount;
  push({ type: 'money', from, to, amount, reason });
}

const name = (t) => team(t).name;

// ---------- Moviment ----------
function moveSteps(t, steps) {
  const T = team(t);
  const path = [];
  let pos = T.pos;
  const dir = steps >= 0 ? 1 : -1;
  for (let k = 0; k < Math.abs(steps); k++) {
    pos = (pos + dir + N()) % N();
    path.push(pos);
    if (dir > 0 && pos === 0) {
      transfer('bank', t, rules().goSalary);
      log(`${T.name} passa per la Sortida i cobra ${money(rules().goSalary)}.`, 'good');
    }
  }
  T.pos = pos;
  push({ type: 'move', team: t, path });
}

function moveTo(t, target, collectGo = true) {
  const T = team(t);
  if (target === T.pos) return;
  const steps = (target - T.pos + N()) % N();
  if (collectGo) moveSteps(t, steps);
  else {
    T.pos = target;
    push({ type: 'move', team: t, path: [target], jump: true });
  }
}

function sendToJail(t) {
  const T = team(t);
  T.pos = jailIndex();
  T.jail = true;
  T.jailTurns = 0;
  push({ type: 'move', team: t, path: [T.pos], jump: true });
  push({ type: 'banner', text: 'A la presó!', tone: 'bad', team: t });
  log(`${T.name} va a la presó.`, 'bad');
}

// Què passa quan un equip cau en una casella
function land(t, front = false) {
  const i = team(t).pos;
  const s = sq(i);
  const T = team(t);
  const add = (item) => (front ? state.queue.unshift(item) : state.queue.push(item));
  push({ type: 'land', square: i });
  switch (s.type) {
    case 'prop':
    case 'station': {
      const o = ownerOf(i);
      if (o === null) add({ type: 'buy', sq: i, team: t });
      else if (o !== t) {
        const r = rentFor(i);
        if (r > 0) {
          transfer(t, o, r, 'lloguer');
          push({ type: 'banner', text: `Lloguer: ${money(r)}`, tone: 'bad', team: t, sub: `${T.name} paga a ${name(o)}` });
          log(`${T.name} paga ${money(r)} de lloguer a ${name(o)} per ${s.name}.`, 'bad');
        } else {
          log(`${s.name} està hipotecada: ${T.name} no paga res.`, 'info');
        }
      }
      break;
    }
    case 'chance': {
      const deck = rules().chanceDeck === 'mix' ? (Math.random() < 0.5 ? 'good' : 'bad') : rules().chanceDeck;
      add({ type: 'card', deck, card: draw(deck), team: t, from: 'interrogant' });
      break;
    }
    case 'tax':
      transfer(t, 'bank', s.amount, 'multa');
      push({ type: 'banner', text: `Multa: ${money(s.amount)}`, tone: 'bad', team: t });
      log(`${T.name} paga una multa de ${money(s.amount)}.`, 'bad');
      break;
    case 'gotojail':
      sendToJail(t);
      break;
    case 'parking':
      if (rules().parkingPot && state.pot > 0) {
        const p = state.pot;
        transfer('pot', t, p, 'pot');
        push({ type: 'banner', text: `Pot del pàrquing: ${money(p)}`, tone: 'good', team: t });
        log(`${T.name} s'emporta el pot del pàrquing: ${money(p)}.`, 'good');
      }
      break;
    default:
      break;
  }
}

function draw(deck) {
  if (!state.decks[deck].length) {
    state.decks[deck] = shuffle(range(state.config.cards[deck].length));
    log(`Es tornen a barrejar les cartes de ${deck === 'good' ? rules().goodName : rules().badName}.`, 'info');
  }
  return state.decks[deck].pop();
}

// ---------- Accions del torn ----------
export function roll(n) {
  if (state.phase !== 'roll' || state.queue.length || !state.started) return;
  checkpoint();
  const t = state.turn;
  const T = team(t);
  state.lastRoll = n;
  if (T.jail) {
    const R = rules();
    const max = Math.max(1, R.jailMaxTurns || 3);
    if (R.jailRoll && n === R.jailExitRoll) {
      T.jail = false; T.jailTurns = 0;
      log(`${T.name} treu un ${n} i surt de la presó.`, 'good');
    } else {
      T.jailTurns++;
      if (T.jailTurns >= max) {
        if (R.jailPay) {
          transfer(t, 'bank', R.jailFine, 'presó');
          log(`${T.name} ha passat ${max} torns a la presó: paga ${money(R.jailFine)} i surt.`, 'bad');
        } else {
          log(`${T.name} ja ha complert ${max} torns a la presó i surt.`, 'info');
        }
        T.jail = false; T.jailTurns = 0;
      } else {
        log(`${T.name} treu un ${n} i es queda a la presó (torn ${T.jailTurns} de ${max}).`, 'info');
        state.phase = 'end';
        save();
        return;
      }
    }
  } else {
    log(`${T.name} treu un ${n}.`, 'info');
  }
  moveSteps(t, n);
  land(t);
  state.phase = 'end';
  save();
}

export function payJail() {
  const t = state.turn;
  const T = team(t);
  if (!T.jail || state.phase !== 'roll' || !rules().jailPay) return;
  checkpoint();
  transfer(t, 'bank', rules().jailFine, 'presó');
  T.jail = false; T.jailTurns = 0;
  log(`${T.name} paga ${money(rules().jailFine)} i surt de la presó. Ara ha de tirar.`, 'info');
  save();
}

export function useJailCard() {
  const t = state.turn;
  const T = team(t);
  if (!T.jail || !T.jailCards || state.phase !== 'roll') return;
  checkpoint();
  T.jailCards--; T.jail = false; T.jailTurns = 0;
  log(`${T.name} fa servir la carta i surt de la presó. Ara ha de tirar.`, 'good');
  save();
}

export function endTurn() {
  if (state.queue.length) return;
  checkpoint();
  const cur = current();
  if (cur.extra > 0 && !cur.bankrupt) {
    cur.extra--;
    state.phase = 'roll';
    log(`${cur.name} té una tirada extra.`, 'good');
    save();
    return;
  }
  let next = state.turn;
  for (let guard = 0; guard < 12; guard++) {
    next = (next + 1) % state.teams.length;
    if (next === 0) state.round++;
    const T = team(next);
    if (T.bankrupt) continue;
    if (T.skip > 0) {
      T.skip--;
      log(`${T.name} perd aquest torn.`, 'bad');
      continue;
    }
    break;
  }
  state.turn = next;
  state.phase = 'roll';
  state.lastRoll = null;
  push({ type: 'turn', team: next });
  save();
}

// ---------- Compres i subhastes ----------
export function buy(i, t, price = sq(i).price) {
  checkpoint();
  state.queue = state.queue.filter((q) => !(q.type === 'buy' && q.sq === i));
  state.owners[i] = { team: t, houses: 0, mortgaged: false };
  transfer(t, 'bank', price, 'compra');
  push({ type: 'buy', team: t, square: i });
  log(`${name(t)} compra ${sq(i).name} per ${money(price)}.`, 'good');
  if (sq(i).group && ownsGroup(t, sq(i).group)) {
    push({ type: 'confetti', team: t });
    log(`${name(t)} té tot el grup ${state.config.groups[sq(i).group].name}! Ja hi pot construir.`, 'good');
  }
  save();
}

export function startAuction(i) {
  checkpoint();
  state.queue = state.queue.filter((q) => !(q.type === 'buy' && q.sq === i));
  state.queue.unshift({ type: 'auction', sq: i });
  save();
}

export function auctionWin(i, t, price) {
  // la subhasta ve d'una casella sense amo o d'una propietat d'un equip
  checkpoint();
  state.queue = state.queue.filter((q) => !(q.type === 'auction' && q.sq === i));
  const prev = ownerOf(i);
  if (prev !== null && prev !== t) {
    transfer(t, prev, price, 'subhasta');
    state.owners[i].team = t;
  } else if (prev === null) {
    state.owners[i] = { team: t, houses: 0, mortgaged: false };
    transfer(t, 'bank', price, 'subhasta');
  }
  push({ type: 'buy', team: t, square: i });
  push({ type: 'banner', text: 'Adjudicat!', tone: 'good', team: t, sub: `${sq(i).name} per ${money(price)}` });
  log(`${name(t)} guanya la subhasta de ${sq(i).name} per ${money(price)}.`, 'good');
  if (sq(i).group && ownsGroup(t, sq(i).group)) push({ type: 'confetti', team: t });
  save();
}

export function dismissQueueItem() {
  checkpoint();
  const q = state.queue.shift();
  if (q && q.type === 'buy') log(`${name(q.team)} no compra ${sq(q.sq).name}.`, 'info');
  if (q && q.type === 'auction') log(`Ningú es queda ${sq(q.sq).name}.`, 'info');
  save();
}

// ---------- Cartes ----------
export function cardOf(q) {
  return state.config.cards[q.deck][q.card];
}

export function drawCard(t, deck) {
  checkpoint();
  state.queue.push({ type: 'card', deck, card: draw(deck), team: t, from: 'manual' });
  save();
}

export function applyCard() {
  const q = state.queue[0];
  if (!q || q.type !== 'card') return;
  checkpoint();
  state.queue.shift();
  const c = cardOf(q);
  const t = q.team;
  const T = team(t);
  const v = Number(c.value) || 0;
  log(`${T.name}: «${c.text}»`, q.deck === 'good' ? 'good' : 'bad');
  switch (c.effect) {
    case 'money':
      if (v >= 0) transfer('bank', t, v, 'carta'); else transfer(t, 'bank', -v, 'carta');
      break;
    case 'each':
      activeTeams().filter((o) => o !== t).forEach((o) => {
        if (v >= 0) transfer(o, t, v, 'carta'); else transfer(t, o, -v, 'carta');
      });
      break;
    case 'goto':
      moveTo(t, ((v % N()) + N()) % N(), true);
      land(t, true);
      break;
    case 'move':
      if (v >= 0) moveSteps(t, v);
      else { T.pos = (T.pos + v + N() * 10) % N(); push({ type: 'move', team: t, path: backPath(t, v) }); }
      land(t, true);
      break;
    case 'jail':
      sendToJail(t);
      if (state.turn === t) state.phase = 'end';
      break;
    case 'jailfree':
      T.jailCards++;
      break;
    case 'repairs': {
      let total = 0;
      propsOf(t).forEach((i) => {
        const h = state.owners[i].houses;
        total += h === 5 ? v * 3 : h * v;
      });
      if (total) transfer(t, 'bank', total, 'reparacions');
      log(`${T.name} paga ${money(total)} de reparacions.`, 'bad');
      break;
    }
    case 'skip':
      T.skip++;
      break;
    case 'extra':
      T.extra++;
      break;
    default:
      break;
  }
  save();
}

function backPath(t, v) {
  // el pos ja és el final: reconstruïm el camí cap enrere
  const end = team(t).pos;
  const path = [];
  let p = (end - v) % N();
  for (let k = 0; k < Math.abs(v); k++) {
    p = (p - 1 + N()) % N();
    path.push(p);
  }
  return path;
}

// Repartiment després d'un minijoc. dist = { índexEquip: n } (n > 0 bones, n < 0 dolentes)
export function minigame(dist, gameName) {
  checkpoint();
  const parts = [];
  Object.entries(dist).forEach(([k, n]) => {
    const t = Number(k);
    if (!n || team(t).bankrupt) return;
    const deck = n > 0 ? 'good' : 'bad';
    for (let j = 0; j < Math.abs(n); j++) {
      state.queue.push({ type: 'card', deck, card: draw(deck), team: t, from: 'minijoc', idx: j + 1, of: Math.abs(n) });
    }
    parts.push(`${name(t)} ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  });
  log(`Minijoc${gameName ? ` (${gameName})` : ''}: ${parts.join(', ') || 'sense cartes'}.`, 'info');
  save();
}

// ---------- Construir i hipotecar ----------
export function canBuild(i) {
  const o = state.owners[i];
  const s = sq(i);
  if (!o || s.type !== 'prop') return 'Només es pot construir en carrers.';
  if (!ownsGroup(o.team, s.group)) return 'Cal tenir tot el grup de color.';
  const g = groupSquares(s.group);
  if (g.some((j) => state.owners[j].mortgaged)) return 'Hi ha una propietat del grup hipotecada.';
  if (o.houses >= 5) return 'Ja té hotel.';
  const min = Math.min(...g.map((j) => state.owners[j].houses));
  if (o.houses > min) return 'Cal construir de manera igualada dins del grup.';
  if (team(o.team).money < s.house) return 'No hi ha prou diners.';
  return null;
}

export function build(i) {
  const err = canBuild(i);
  if (err) return err;
  checkpoint();
  const o = state.owners[i];
  o.houses++;
  transfer(o.team, 'bank', sq(i).house, 'construcció');
  push({ type: 'build', square: i });
  log(`${name(o.team)} construeix ${o.houses === 5 ? 'un hotel' : 'una casa'} a ${sq(i).name}.`, 'good');
  save();
  return null;
}

export function sellHouse(i) {
  const o = state.owners[i];
  if (!o || !o.houses) return 'No hi ha cases per vendre.';
  const g = groupSquares(sq(i).group);
  const max = Math.max(...g.map((j) => state.owners[j].houses));
  if (o.houses < max) return 'Cal vendre de manera igualada dins del grup.';
  checkpoint();
  o.houses--;
  transfer('bank', o.team, Math.floor(sq(i).house / 2), 'venda');
  log(`${name(o.team)} ven una casa de ${sq(i).name}.`, 'info');
  save();
  return null;
}

export function toggleMortgage(i) {
  const o = state.owners[i];
  if (!o) return 'No té amo.';
  const s = sq(i);
  if (!o.mortgaged) {
    if (s.group && groupSquares(s.group).some((j) => state.owners[j]?.houses)) return 'Primer cal vendre les cases del grup.';
    checkpoint();
    o.mortgaged = true;
    transfer('bank', o.team, s.price / 2, 'hipoteca');
    log(`${name(o.team)} hipoteca ${s.name} i rep ${money(s.price / 2)}.`, 'info');
  } else {
    const cost = Math.ceil((s.price / 2) * 1.1);
    if (team(o.team).money < cost) return `Calen ${money(cost)} per aixecar la hipoteca.`;
    checkpoint();
    o.mortgaged = false;
    transfer(o.team, 'bank', cost, 'hipoteca');
    log(`${name(o.team)} aixeca la hipoteca de ${s.name} per ${money(cost)}.`, 'info');
  }
  save();
  return null;
}

// ---------- Ajustos manuals ----------
export function adjust(t, amount, concept, toTeam = null) {
  if (!amount) return;
  checkpoint();
  const what = concept ? ` (${concept})` : '';
  if (toTeam !== null && toTeam !== t) {
    transfer(t, toTeam, amount, concept);
    log(`${name(t)} paga ${money(amount)} a ${name(toTeam)}${what}.`, 'info');
  } else if (amount < 0) {
    transfer(t, 'bank', -amount, concept);
    log(`${name(t)} paga ${money(-amount)}${what}.`, 'bad');
  } else {
    transfer('bank', t, amount, concept);
    log(`${name(t)} rep ${money(amount)}${what}.`, 'good');
  }
  save();
}

export function setOwner(i, t) {
  checkpoint();
  if (t === null) {
    delete state.owners[i];
    log(`${sq(i).name} torna al banc.`, 'info');
  } else {
    const prev = state.owners[i];
    state.owners[i] = { team: t, houses: prev ? prev.houses : 0, mortgaged: prev ? prev.mortgaged : false };
    push({ type: 'buy', team: t, square: i });
    log(`${sq(i).name} passa a ser de ${name(t)}.`, 'info');
  }
  save();
}

export function trade({ a, b, aProps, bProps, aMoney, bMoney }) {
  checkpoint();
  aProps.forEach((i) => { state.owners[i].team = b; push({ type: 'buy', team: b, square: i }); });
  bProps.forEach((i) => { state.owners[i].team = a; push({ type: 'buy', team: a, square: i }); });
  if (aMoney) transfer(a, b, aMoney, 'intercanvi');
  if (bMoney) transfer(b, a, bMoney, 'intercanvi');
  const desc = (props, m) => [...props.map((i) => sq(i).name), m ? money(m) : null].filter(Boolean).join(' + ') || 'res';
  log(`Intercanvi: ${name(a)} dona ${desc(aProps, aMoney)} i ${name(b)} dona ${desc(bProps, bMoney)}.`, 'info');
  [a, b].forEach((t) => {
    const groups = new Set(propsOf(t).map((i) => sq(i).group).filter(Boolean));
    groups.forEach((g) => { if (ownsGroup(t, g) && [...aProps, ...bProps].some((i) => sq(i).group === g)) push({ type: 'confetti', team: t }); });
  });
  push({ type: 'banner', text: 'Tracte fet!', tone: 'good', team: a, sub: `${name(a)} i ${name(b)}` });
  save();
}

export function placeTeam(t, i, doLand) {
  checkpoint();
  team(t).pos = i;
  team(t).jail = false;
  push({ type: 'move', team: t, path: [i], jump: true });
  log(`${name(t)} es mou a ${sq(i).name}.`, 'info');
  if (doLand) land(t, true);
  save();
}

export function toggleJail(t) {
  checkpoint();
  const T = team(t);
  if (T.jail) { T.jail = false; T.jailTurns = 0; log(`${T.name} surt de la presó.`, 'info'); }
  else sendToJail(t);
  save();
}

export function setJailCards(t, n) {
  checkpoint();
  team(t).jailCards = Math.max(0, n);
  save();
}

export function bankrupt(t) {
  checkpoint();
  const T = team(t);
  propsOf(t).forEach((i) => delete state.owners[i]);
  T.bankrupt = true;
  T.money = 0;
  log(`${T.name} fa fallida. Les seves propietats tornen al banc.`, 'bad');
  push({ type: 'banner', text: 'Fallida!', tone: 'bad', team: t });
  save();
  if (state.turn === t) { state.queue = []; endTurn(); }
}

export function revive(t) {
  checkpoint();
  team(t).bankrupt = false;
  log(`${team(t).name} torna a la partida.`, 'info');
  save();
}

// ---------- Configuració ----------
export function updateConfig(mut) {
  checkpoint();
  mut(state);
  // si han canviat les cartes, rebarregem els malls
  ['good', 'bad'].forEach((d) => {
    const n = state.config.cards[d].length;
    state.decks[d] = state.decks[d].filter((k) => k < n);
    if (!state.decks[d].length) state.decks[d] = shuffle(range(n));
  });
  save();
}

export function exportGame() {
  return JSON.stringify(state, null, 2);
}

export function importGame(text) {
  const s = JSON.parse(text);
  if (!s.config || !s.teams) throw new Error('El fitxer no és una partida del Caupoli.');
  checkpoint();
  state = s;
  migrate();
  save();
}
