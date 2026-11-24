// Connecta el motor amb la pantalla: botons, finestres i teclat.
import * as G from './engine.js?v=1795557190';
import {
  buildBoard, renderAll, renderCenter, renderTeams, renderSquares, playFx, syncDisplay, isPlaying,
  icon, esc, toast, drawCardFx, setMutedRef,
} from './board.js?v=1795557190';
import { photoOf, setPhoto, avatarStyle, avatarText } from './util.js?v=1795557190';
import * as S3 from './scene.js?v=1795557190';
import { sfx, toggleMute, isMuted, SOUNDS, preview, getVolume, setVolume, isOff, setOff } from './sound.js?v=1795557190';
import { EFFECTS, MINIGAMES, GROUPS, deckName } from './data.js?v=1795557190';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const dlg = $('#modal');
const clone = (o) => JSON.parse(JSON.stringify(o));
const S = () => G.state;

// ---------- Cicle principal ----------
function full() {
  renderAll(isMuted());
}

async function after() {
  G.checkBankrupt(); // en negatiu i sense res per hipotecar ni vendre: fallida
  if (dlg.open && !dlg.dataset.keep) dlg.close();
  renderCenter();
  // mentre es mouen les coses, els botons esperen (així no es pot saltar res)
  document.body.classList.add('busy');
  try { await playFx(); } finally { document.body.classList.remove('busy'); }
  syncDisplay();
  full();
  openQueue();
}

let drawing = false;
// hi ha alguna cosa en marxa (animacions o una carta girant-se): ara no s'ha de poder clicar res del joc
const busyNow = () => isPlaying() || drawing;
async function openQueue() {
  if (dlg.open || isPlaying() || drawing) return;
  const q = S().queue[0];
  if (!q) return;
  if (q.type === 'buy') buyModal(q);
  else if (q.type === 'auction') auctionModal(q);
  else if (q.type === 'card') {
    drawing = true;
    document.body.classList.add('busy');
    sfx.flip();
    const c = G.cardOf(q);
    try { await drawCardFx(q.deck, { text: c?.text, foot: c ? effectSummary(c) : '' }); await new Promise((r) => setTimeout(r, 250)); } finally { drawing = false; document.body.classList.remove('busy'); }
    if (S().queue[0] === q && !dlg.open) cardModal(q, S3.currentCardId());
    else S3.dropCard();
  }
}

// ---------- Finestres ----------
function openModal({ title, body, foot = '', wide = false, onMount }) {
  dlg.className = `modal${wide ? ' wide' : ''}`;
  delete dlg.dataset.keep;
  if (dlg.dataset.cardId) { S3.dropCard(false, Number(dlg.dataset.cardId)); delete dlg.dataset.cardId; }
  dlg.innerHTML = `<div class="m-wrap">
    <div class="m-head"><h2>${title}</h2><button class="icon-btn m-close" type="button" data-close aria-label="Tancar">${icon('close')}</button></div>
    <div class="m-body">${body}</div>
    ${foot ? `<div class="m-foot">${foot}</div>` : ''}
  </div>`;
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  onMount?.(dlg);
}
dlg.addEventListener('close', () => {
  // si es tanca una finestra d'acció pendent, el botó «Continuar» del centre la torna a obrir
  const id = dlg.dataset.cardId;
  delete dlg.dataset.cardId;
  if (id && !dlg.dataset.keep) S3.dropCard(false, Number(id));
  renderCenter();
});
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

const teamPick = (name, selected = null, { exclude = [], allowNone = false } = {}) => `
  <div class="team-pick" role="group" data-pick="${name}">
    ${allowNone ? `<button type="button" data-v="" aria-pressed="${selected === null}" style="--tc:var(--ink)"><span class="sw" style="background:var(--paper-2)"></span>Banc</button>` : ''}
    ${S().teams.map((t, k) => `<button type="button" data-v="${k}" aria-pressed="${selected === k}" style="--tc:${t.color}" ${exclude.includes(k) || t.bankrupt ? 'disabled' : ''}><span class="sw" style="${avatarStyle(t)}"></span>${esc(t.name)}</button>`).join('')}
  </div>`;

function bindPick(root, name, onChange) {
  const box = root.querySelector(`[data-pick="${name}"]`);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange(b.dataset.v === '' ? null : Number(b.dataset.v));
  });
}

function deedHTML(i, highlight = null) {
  const s = G.sq(i);
  const o = S().owners[i];
  const color = s.type === 'station' ? 'var(--ink)' : S().config.groups[s.group]?.color;
  const light = s.group === 'groc' || s.group === 'cel';
  let rows = '';
  if (s.type === 'prop') {
    const labels = ['Lloguer', 'Amb 1 casa', 'Amb 2 cases', 'Amb 3 cases', 'Amb 4 cases', 'Amb hotel'];
    const cur = o ? o.houses : -1;
    rows += `<tr class="${cur === 0 && !G.ownsGroup(o?.team, s.group) ? 'cur' : ''}"><td>${labels[0]}</td><td>${G.money(s.rent[0])}</td></tr>`;
    rows += `<tr class="${cur === 0 && o && G.ownsGroup(o.team, s.group) ? 'cur' : ''}"><td>Amb tot el grup</td><td>${G.money(s.rent[0] * 2)}</td></tr>`;
    for (let h = 1; h <= 5; h++) rows += `<tr class="${cur === h ? 'cur' : ''}"><td>${labels[h]}</td><td>${G.money(s.rent[h])}</td></tr>`;
  } else {
    G.rules().stationRent.forEach((r, k) => { rows += `<tr><td>Amb ${k + 1} estaci${k ? 'ons' : 'ó'}</td><td>${G.money(r)}</td></tr>`; });
  }
  return `<div class="deed">
    <div class="deed-head${light ? ' light' : ''}" style="--g:${color}"><small>Títol de propietat</small><b>${esc(s.name)}</b></div>
    <table>${rows}</table>
    <div class="deed-foot">Preu: ${G.money(s.price)}<br>${s.house ? `Cada casa: ${G.money(s.house)}<br>` : ''}Hipoteca: ${G.money(s.price / 2)}</div>
  </div>`;
}

// ---------- Comprar ----------
function buyModal(q) {
  const s = G.sq(q.sq);
  const T = G.team(q.team);
  const enough = T.money >= s.price;
  openModal({
    title: `${esc(T.name)} ha caigut a ${esc(s.name)}`,
    body: `<div class="split">${deedHTML(q.sq)}<div class="grow">
      <p class="lead">Ningú té aquesta propietat. La vol comprar?</p>
      <div class="pricebox" style="--tc:${T.color}">
        <span class="pb-label">Preu</span>
        <span class="pb-price">${G.money(s.price)}</span>
        <span class="pb-row"><span>${esc(T.name)} té</span><b>${G.money(T.money)}</b></span>
        <span class="pb-row"><span>Després de comprar-la tindrà</span><b class="${enough ? '' : 'neg'}">${G.money(T.money - s.price)}</b></span>
      </div>
      <p class="muted">${enough ? 'Si no la compra, es pot subhastar entre tots els equips.' : 'No té prou diners per comprar-la: es pot subhastar.'}</p>
    </div></div>`,
    foot: `<button class="btn btn-ghost" type="button" data-a="skip">No comprar</button><span class="spacer"></span>
      <button class="btn" type="button" data-a="auction">${icon('gavel')}Subhastar</button>
      <button class="btn btn-primary" type="button" data-a="buy" ${enough ? '' : 'disabled'}>Comprar per ${G.money(s.price)}</button>`,
    onMount(d) {
      d.querySelector('[data-a=buy]').addEventListener('click', () => { const err = G.buy(q.sq, q.team); if (err) toast(err); after(); });
      d.querySelector('[data-a=auction]').addEventListener('click', () => { G.startAuction(q.sq); dlg.close(); after(); });
      d.querySelector('[data-a=skip]').addEventListener('click', () => { G.dismissQueueItem(); after(); });
      d.querySelector('[data-a=buy]:not(:disabled)')?.focus();
    },
  });
}

// ---------- Subhasta ----------
function auctionModal(q) {
  const i = q.sq;
  const s = G.sq(i);
  const owner = G.ownerOf(i);
  const bids = {};
  const top = () => {
    let best = null;
    Object.entries(bids).forEach(([k, v]) => { if (v > 0 && (best === null || v > bids[best])) best = Number(k); });
    return best;
  };
  const rowsHTML = () => S().teams.map((t, k) => {
    const out = t.bankrupt || k === owner;
    const tb = top();
    const note = t.bankrupt ? 'Fora de la partida' : k === owner ? 'És qui ven' : `Té ${G.money(t.money)}`;
    return `<div class="auc-row${tb === k ? ' top' : ''}${out ? ' out' : ''}">
      <span class="auc-av" style="${avatarStyle(t)}">${avatarText(t)}</span>
      <div class="auc-who"><b>${esc(t.name)}</b><span>${note}</span></div>
      <div class="auc-bid">${bids[k] ? G.money(bids[k]) : ''}</div>
      <div class="auc-btns">${out ? '' : [10, 50, 100].map((inc) => {
    const next = (tb === null ? 0 : bids[tb]) + inc;
    return `<button class="btn" type="button" data-bid="${k}" data-inc="${inc}" ${next > t.money ? 'disabled title="No té prou diners"' : ''}>+${inc}</button>`;
  }).join('')}</div>
    </div>`;
  }).join('');
  openModal({
    wide: true,
    title: `Subhasta: ${esc(s.name)}`,
    body: `<div class="split">${deedHTML(i)}<div class="grow">
      <p class="lead">${owner !== null ? `${esc(G.team(owner).name)} ven la propietat al millor postor.` : 'Cada equip puja. Guanya qui ofereix més.'}</p>
      <div class="pricebox" id="aucTop"><span class="pb-label">Oferta més alta</span><span class="pb-price">Encara cap</span></div>
      <div id="aucRows">${rowsHTML()}</div>
      <p class="muted" style="margin-top:12px">Cada botó supera l'oferta més alta.</p>
    </div></div>`,
    foot: `<button class="btn btn-ghost" type="button" data-a="none">Ningú la vol</button><span class="spacer"></span>
      <button class="btn btn-primary" type="button" data-a="win" disabled>Adjudicar</button>`,
    onMount(d) {
      const winBtn = d.querySelector('[data-a=win]');
      const refresh = () => {
        d.querySelector('#aucRows').innerHTML = rowsHTML();
        const tb = top();
        winBtn.disabled = tb === null;
        winBtn.textContent = tb === null ? 'Adjudicar' : `Adjudicar a ${G.team(tb).name} per ${G.money(bids[tb])}`;
        const topBox = d.querySelector('#aucTop');
        topBox.style.setProperty('--tc', tb === null ? 'var(--ink)' : G.team(tb).color);
        topBox.innerHTML = tb === null
          ? '<span class="pb-label">Oferta més alta</span><span class="pb-price">Encara cap</span>'
          : `<span class="pb-label">Oferta més alta</span><span class="pb-price">${G.money(bids[tb])}</span><span class="pb-row"><span>Guanya ara</span><b>${esc(G.team(tb).name)}</b></span>`;
        topBox.classList.remove('bump'); void topBox.offsetWidth; topBox.classList.add('bump');
      };
      d.querySelector('#aucRows').addEventListener('click', (e) => {
        const b = e.target.closest('[data-bid]');
        if (!b) return;
        const k = Number(b.dataset.bid);
        const tb = top();
        const base = tb === null ? 0 : bids[tb];
        bids[k] = base + Number(b.dataset.inc);
        sfx.click();
        refresh();
      });
      winBtn.addEventListener('click', () => { const tb = top(); const err = G.auctionWin(i, tb, bids[tb]); if (err) { toast(err); return; } after(); });
      d.querySelector('[data-a=none]').addEventListener('click', () => { G.dismissQueueItem(); after(); });
    },
  });
}

function auctionPicker() {
  const items = S().config.board.map((s, i) => ({ s, i })).filter(({ i }) => G.isBuyable(i));
  const row = ({ s, i }) => {
    const o = G.ownerOf(i);
    const color = s.type === 'station' ? 'var(--ink)' : S().config.groups[s.group]?.color;
    return `<div class="prow"><span class="chip" style="--g:${color}"></span><div><b>${esc(s.name)}</b><div class="meta">${o === null ? `Sense amo, preu ${G.money(s.price)}` : `De ${esc(G.team(o).name)}`}</div></div>
      <div class="acts"><button class="btn" type="button" data-auc="${i}" ${S().owners[i]?.houses ? 'disabled title="Té cases"' : ''}>${icon('gavel')}Subhastar</button></div></div>`;
  };
  openModal({
    title: 'Quina propietat es subhasta?',
    body: `<div class="plist">${items.map(row).join('')}</div>`,
    onMount(d) {
      d.querySelectorAll('[data-auc]').forEach((b) => b.addEventListener('click', () => {
        const err = G.startAuction(Number(b.dataset.auc));
        if (err) { toast(err); return; }
        dlg.close();
        after();
      }));
    },
  });
}

// ---------- Cartes ----------
function effectSummary(c) {
  const v = Number(c.value) || 0;
  switch (c.effect) {
    case 'money': return v >= 0 ? `Cobra ${G.money(v)}` : `Paga ${G.money(-v)}`;
    case 'each': return v >= 0 ? `Cobra ${G.money(v)} de cada equip` : `Paga ${G.money(-v)} a cada equip`;
    case 'goto': return `Va a ${G.sq(((v % G.N()) + G.N()) % G.N())?.name || 'la casella'}`;
    case 'move': return v >= 0 ? `Avança ${v} caselles` : `Retrocedeix ${-v} caselles`;
    case 'jail': return 'Va a la presó';
    case 'jailfree': return 'Es guarda la carta';
    case 'repairs': return `${G.money(v)} per casa`;
    case 'skip': return 'Perd el pròxim torn';
    case 'extra': return 'Tirada extra';
    default: return 'Ho apliqueu vosaltres';
  }
}

function cardModal(q, cardId = null) {
  const c = G.cardOf(q);
  const T = G.team(q.team);
  const good = q.deck === 'good';
  const deckColor = good ? 'var(--good)' : 'var(--deck-bad)';
  const name = esc(deckName(G.rules(), q.deck));
  const count = q.of > 1 ? ` (${q.idx} de ${q.of})` : '';
  openModal({
    title: `${name} per a ${esc(T.name)}${count}`,
    body: `<p class="card-for" style="--tc:${T.color}"><b>${esc(T.name)}</b> agafa una carta de ${name}${count}</p>
      <div class="card-stage"><div class="gcard flip" style="--deck:${deckColor}">
        <div class="gface gback"></div>
        <div class="gface gfront"><div class="ghead">${name}</div>
          <div class="gtext">${esc(c.text)}</div>
          <div class="gfoot">${esc(effectSummary(c))}</div></div>
      </div></div>`,
    foot: `<button class="btn btn-primary btn-big" type="button" data-a="apply">${c.effect === 'text' ? "D'acord" : 'Aplicar la carta'}</button>`,
    onMount(d) {
      if (cardId !== null) dlg.dataset.cardId = String(cardId);
      setTimeout(() => (good ? sfx.good() : sfx.bad()), 450);
      const b = d.querySelector('[data-a=apply]');
      b.addEventListener('click', () => { S3.dropCard(false, cardId); G.applyCard(); after(); });
      b.focus();
    },
  });
}

function deckModal(deck) {
  const good = deck === 'good';
  let pick = G.state.turn;
  openModal({
    title: `Treure una carta de ${esc(deckName(G.rules(), deck))}`,
    body: `<p class="lead">Per a quin equip?</p>${teamPick('t', pick)}<p class="muted" style="margin-top:14px">Queden ${S().decks[deck].length} cartes en aquest mall abans de tornar a barrejar.</p>`,
    foot: `<button class="btn btn-primary" type="button" data-a="go">Treure carta</button>`,
    onMount(d) {
      bindPick(d, 't', (v) => { pick = v; });
      d.querySelector('[data-a=go]').addEventListener('click', () => {
        if (S().queue.length) { toast('Primer cal resoldre l\'acció pendent.'); return; }
        G.drawCard(pick, deck);
        dlg.close();
        after();
      });
    },
  });
}

// ---------- Minijoc ----------
function minigameModal() {
  if (S().queue.length) { toast('Primer cal resoldre l\'acció pendent: premeu «Continuar».'); return; }
  const dist = {};
  S().teams.forEach((t, k) => { dist[k] = 0; });
  const vals = [-3, -2, -1, 0, 1, 2, 3];
  const GN = deckName(G.rules(), 'good');
  const BN = deckName(G.rules(), 'bad');
  const hint = (n) => (n === 0 ? 'Cap carta' : `${Math.abs(n)} ${Math.abs(n) > 1 ? 'cartes' : 'carta'} de ${n > 0 ? GN : BN}`);
  const rows = S().teams.map((t, k) => (t.bankrupt ? '' : `<div class="mg-row" data-row="${k}">
      <div class="mg-team" style="--tc:${t.color}"><span class="sw" style="${avatarStyle(t)}"></span>${esc(t.name)}</div>
      <div class="seg" role="group" aria-label="Cartes per a ${esc(t.name)}">${vals.map((v) => `<button type="button" data-v="${v}" class="${v < 0 ? 'neg' : v > 0 ? 'pos' : 'zero'}" aria-pressed="${v === 0}">${v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'}</button>`).join('')}</div>
      <div class="mg-hint">Cap carta</div>
    </div>`)).join('');
  openModal({
    title: 'Minijoc fet',
    body: `<p class="lead">Marqueu quantes cartes agafa cada equip: en positiu, de ${esc(GN)}; en negatiu, de ${esc(BN)}.</p>
      <div class="field"><span>Quin minijoc era? (opcional)</span>
        <select id="mgName"><option value="">Sense nom</option>${MINIGAMES.map((m) => `<option>${esc(m)}</option>`).join('')}</select></div>
      ${rows}
      <div class="chips-row" style="margin-top:14px">
        <button class="pill" type="button" data-preset="clear">Tot a zero</button>
      </div>`,
    foot: `<span class="muted" id="mgTotal"></span><span class="spacer"></span><button class="btn btn-primary" type="button" data-a="go" disabled>Repartir cartes</button>`,
    onMount(d) {
      const go = d.querySelector('[data-a=go]');
      const refresh = () => {
        let g = 0; let b = 0;
        Object.values(dist).forEach((n) => { if (n > 0) g += n; else b -= n; });
        go.disabled = g + b === 0;
        d.querySelector('#mgTotal').textContent = g + b ? `${g} de ${GN} i ${b} de ${BN}` : '';
        $$('[data-row]', d).forEach((row) => {
          const n = dist[row.dataset.row];
          row.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.v) === n)));
          row.querySelector('.mg-hint').textContent = hint(n);
        });
      };
      d.querySelectorAll('[data-row]').forEach((row) => row.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]');
        if (!b) return;
        dist[row.dataset.row] = Number(b.dataset.v);
        sfx.click();
        refresh();
      }));
      d.querySelector('[data-preset=clear]').addEventListener('click', () => { Object.keys(dist).forEach((k) => { dist[k] = 0; }); refresh(); });
      go.addEventListener('click', () => { G.minigame(dist, d.querySelector('#mgName').value); dlg.close(); after(); });
    },
  });
}

// ---------- Diners ----------
function moneyModal(preTeam = G.state.turn) {
  let t = preTeam;
  let mode = 'take';
  let to = null;
  let concept = '';
  openModal({
    title: 'Moure diners',
    body: `<div class="field"><span>Equip</span>${teamPick('t', t)}</div>
      <div class="field"><span>Què passa?</span>
        <div class="chips-row" id="mode">
          <button class="pill" type="button" data-m="take" aria-pressed="true">Treure diners</button>
          <button class="pill" type="button" data-m="give" aria-pressed="false">Donar diners</button>
          <button class="pill" type="button" data-m="pay" aria-pressed="false">Paga a un altre equip</button>
        </div></div>
      <div class="field" id="toField" hidden><span>A qui paga</span>${teamPick('to', null)}</div>
      <div class="field"><span>Quantitat</span>
        <div class="row" style="justify-content:flex-start"><input type="number" id="amt" min="0" step="10" inputmode="numeric" style="max-width:180px">
        ${[50, 100, 200, 500].map((v) => `<button class="pill" type="button" data-q="${v}">${v}</button>`).join('')}</div></div>
      <div class="field"><span>Per què (opcional)</span>
        <div class="chips-row" id="concepts">${['Duel', 'Prova', 'Premi', 'Multa', 'Penalització'].map((c) => `<button class="pill" type="button" data-c="${c}" aria-pressed="false">${c}</button>`).join('')}</div>
        <input type="text" id="conceptTxt" placeholder="O escriviu-ho aquí" style="margin-top:8px"></div>`,
    foot: `<button class="btn btn-primary" type="button" data-a="go">Fer-ho</button>`,
    onMount(d) {
      bindPick(d, 't', (v) => { t = v; });
      bindPick(d, 'to', (v) => { to = v; });
      d.querySelector('#mode').addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        mode = b.dataset.m;
        d.querySelectorAll('#mode .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        d.querySelector('#toField').hidden = mode !== 'pay';
      });
      d.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { d.querySelector('#amt').value = b.dataset.q; }));
      d.querySelector('#concepts').addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        const on = b.getAttribute('aria-pressed') !== 'true';
        d.querySelectorAll('#concepts .pill').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', String(on));
        concept = on ? b.dataset.c : '';
      });
      d.querySelector('[data-a=go]').addEventListener('click', () => {
        const a = Math.round(Number(d.querySelector('#amt').value));
        if (!a || a < 0) { toast('Escriviu una quantitat.'); d.querySelector('#amt').focus(); return; }
        if (mode === 'pay' && (to === null || to === t)) { toast('Trieu a quin equip paga.'); return; }
        const c = d.querySelector('#conceptTxt').value.trim() || concept;
        const err = mode === 'take' ? G.adjust(t, -a, c) : mode === 'give' ? G.adjust(t, a, c) : G.adjust(t, a, c, to);
        if (err) { toast(err); return; }
        after();
      });
      setTimeout(() => d.querySelector('#amt').focus(), 50);
    },
  });
}

// ---------- Intercanvi ----------
function tradeModal() {
  let a = 0;
  let b = 1;
  const col = (side) => {
    const k = side === 'a' ? a : b;
    const props = G.propsOf(k);
    const list = props.map((i) => {
      const s = G.sq(i);
      const blocked = s.group && G.groupSquares(s.group).some((j) => S().owners[j]?.houses);
      const color = s.type === 'station' ? 'var(--ink)' : S().config.groups[s.group]?.color;
      const why = blocked ? '<span class="why">té cases al grup</span>' : S().owners[i].mortgaged ? '<span class="why">hipotecada</span>' : '';
      return `<label class="prop-check${blocked ? ' disabled' : ''}"><input type="checkbox" data-side="${side}" value="${i}" ${blocked ? 'disabled' : ''}><span class="chip" style="--g:${color}"></span><span>${esc(s.name)}</span>${why}</label>`;
    }).join('') || '<p class="muted">No té propietats.</p>';
    return `${list}<div class="field" style="margin-top:10px"><span>I diners (té ${G.money(G.team(k).money)})</span><input type="number" min="0" step="10" data-money="${side}" placeholder="0"></div>`;
  };
  const body = () => `<div class="trade">
      <div class="trade-col"><div class="field"><span>Un equip</span>${teamPick('a', a, { exclude: [b] })}</div><div id="colA">${col('a')}</div></div>
      <div class="trade-col"><div class="field"><span>Amb l'altre</span>${teamPick('b', b, { exclude: [a] })}</div><div id="colB">${col('b')}</div></div>
    </div>
    <div class="trade-sum" id="tradeSum"></div>`;
  const summary = (d) => {
    const give = (side, k) => {
      const props = $$(`input[data-side=${side}]:checked`, d).map((x) => G.sq(Number(x.value)).name);
      const m = Math.max(0, Math.round(Number(d.querySelector(`[data-money=${side}]`).value) || 0));
      const parts = [...props, m ? G.money(m) : null].filter(Boolean);
      return `<p><b>${esc(G.team(k).name)}</b> dona: ${parts.length ? esc(parts.join(', ')) : 'res'}</p>`;
    };
    d.querySelector('#tradeSum').innerHTML = give('a', a) + give('b', b);
  };
  const mount = (d) => {
    bindPick(d, 'a', (v) => { a = v; d.querySelector('.m-body').innerHTML = body(); mount(d); });
    bindPick(d, 'b', (v) => { b = v; d.querySelector('.m-body').innerHTML = body(); mount(d); });
    d.querySelector('.m-body').addEventListener('input', () => summary(d));
    d.querySelector('.m-body').addEventListener('change', () => summary(d));
    summary(d);
  };
  openModal({
    title: 'Intercanvi entre equips',
    wide: true,
    body: body(),
    foot: `<button class="btn btn-primary" type="button" data-a="go">${icon('swap')}Fer l'intercanvi</button>`,
    onMount(d) {
      mount(d);
      d.querySelector('[data-a=go]').addEventListener('click', () => {
        const aProps = $$('input[data-side=a]:checked', d).map((x) => Number(x.value));
        const bProps = $$('input[data-side=b]:checked', d).map((x) => Number(x.value));
        const aMoney = Math.max(0, Math.round(Number(d.querySelector('[data-money=a]').value) || 0));
        const bMoney = Math.max(0, Math.round(Number(d.querySelector('[data-money=b]').value) || 0));
        if (!aProps.length && !bProps.length && !aMoney && !bMoney) { toast('Marqueu què es canvia.'); return; }
        const err = G.trade({ a, b, aProps, bProps, aMoney, bMoney });
        if (err) { toast(err); return; }
        after();
      });
    },
  });
}

// ---------- Equip ----------
function propRow(i) {
  const s = G.sq(i);
  const o = S().owners[i];
  const color = s.type === 'station' ? 'var(--ink)' : S().config.groups[s.group]?.color;
  const meta = [
    o.mortgaged ? 'Hipotecada' : `Lloguer ara: ${G.money(G.rentFor(i))}`,
    o.houses ? (o.houses === 5 ? 'Hotel' : `${o.houses} cas${o.houses > 1 ? 'es' : 'a'}`) : '',
  ].filter(Boolean).join('. ');
  const lock = G.manageError(i);
  if (lock) {
    return `<div class="prow"><span class="chip" style="--g:${color}"></span><div><b>${esc(s.name)}</b><div class="meta">${meta}</div></div>
      <div class="acts"><span class="meta">${icon('lock')} ${esc(lock)}</span></div></div>`;
  }
  const canB = s.type === 'prop' && !G.canBuild(i);
  return `<div class="prow"><span class="chip" style="--g:${color}"></span><div><b>${esc(s.name)}</b><div class="meta">${meta}</div></div>
    <div class="acts">
      ${s.type === 'prop' ? `<button class="btn" type="button" data-build="${i}" ${canB ? '' : `title="${esc(G.canBuild(i))}"`}>${o.houses === 4 ? 'Hotel' : 'Casa'} +${G.money(s.house)}</button>` : ''}
      ${o.houses ? `<button class="btn" type="button" data-sell="${i}">Vendre casa</button>` : ''}
      <button class="btn" type="button" data-mort="${i}">${o.mortgaged ? 'Aixecar hipoteca' : 'Hipotecar'}</button>
    </div></div>`;
}

function bindPropActions(d, reopen) {
  const run = (fn) => (e) => {
    const err = fn(Number(e.currentTarget.dataset.build ?? e.currentTarget.dataset.sell ?? e.currentTarget.dataset.mort));
    if (err) { toast(err); return; }
    dlg.dataset.keep = '1';
    after().then(reopen);
  };
  d.querySelectorAll('[data-build]').forEach((b) => b.addEventListener('click', run(G.build)));
  d.querySelectorAll('[data-sell]').forEach((b) => b.addEventListener('click', run(G.sellHouse)));
  d.querySelectorAll('[data-mort]').forEach((b) => b.addEventListener('click', run(G.toggleMortgage)));
}

function teamModal(k) {
  const T = G.team(k);
  const props = G.propsOf(k);
  const options = S().config.board.map((s, i) => `<option value="${i}" ${i === T.pos ? 'selected' : ''}>${i}. ${esc(s.name)}</option>`).join('');
  openModal({
    title: `<span class="title-team"><span class="title-av" style="${avatarStyle(T)}">${avatarText(T)}</span>${esc(T.name)}</span>`,
    wide: true,
    body: `<p class="lead">Té <b>${G.money(T.money)}</b> en efectiu i un patrimoni total de ${G.money(G.netWorth(k))}.</p>
      <h3 class="label">Propietats</h3>
      <div class="plist">${props.map(propRow).join('') || '<p class="muted">Encara no en té cap.</p>'}</div>
      <h3 class="label" style="margin-top:20px">Fitxa</h3>
      <div class="row" style="justify-content:flex-start;align-items:center">
        <select id="pos" style="max-width:300px">${options}</select>
        <label class="check"><input type="checkbox" id="doLand"> Fer el que diu la casella</label>
        <button class="btn" type="button" data-a="move">Moure la fitxa</button>
      </div>
      <div class="row" style="justify-content:flex-start;margin-top:12px">
        <button class="btn" type="button" data-a="jail">${icon('lock')}${T.jail ? 'Treure de la presó' : 'Enviar a la presó'}</button>
        <span class="label" style="align-self:center;margin-left:8px">Cartes per sortir de la presó: ${T.jailCards}</span>
        <button class="btn" type="button" data-a="jc-" ${T.jailCards ? '' : 'disabled'} aria-label="Treure una carta">−</button>
        <button class="btn" type="button" data-a="jc+" aria-label="Afegir una carta">+</button>
      </div>`,
    foot: `${T.bankrupt ? '<button class="btn" type="button" data-a="revive">Tornar a la partida</button>' : '<button class="btn btn-danger" type="button" data-a="bankrupt">Fallida</button>'}
      <span class="spacer"></span>
      <button class="btn" type="button" data-a="money">${icon('coins')}Moure diners</button>`,
    onMount(d) {
      const reopen = () => teamModal(k);
      bindPropActions(d, reopen);
      d.querySelector('[data-a=move]').addEventListener('click', () => {
        G.placeTeam(k, Number(d.querySelector('#pos').value), d.querySelector('#doLand').checked);
        after();
      });
      d.querySelector('[data-a=jail]').addEventListener('click', () => { G.toggleJail(k); after(); });
      d.querySelector('[data-a="jc-"]').addEventListener('click', () => { G.setJailCards(k, T.jailCards - 1); dlg.dataset.keep = '1'; after().then(reopen); });
      d.querySelector('[data-a="jc+"]').addEventListener('click', () => { G.setJailCards(k, T.jailCards + 1); dlg.dataset.keep = '1'; after().then(reopen); });
      d.querySelector('[data-a=money]').addEventListener('click', () => moneyModal(k));
      d.querySelector('[data-a=bankrupt]')?.addEventListener('click', () => {
        if (!confirm(`${T.name} fa fallida? Les seves propietats tornaran al banc. Es pot desfer amb el botó de desfer.`)) return;
        G.bankrupt(k);
        after();
      });
      d.querySelector('[data-a=revive]')?.addEventListener('click', () => { G.revive(k); after(); });
    },
  });
}

// ---------- Casella ----------
const SQUARE_HELP = {
  go: () => `Cada cop que un equip hi passa o hi cau, cobra ${G.money(G.rules().goSalary)}.`,
  jail: () => {
    const R = G.rules();
    const ways = [R.jailRoll ? `treure un ${R.jailExitRoll}` : null, R.jailPay ? `pagar ${G.money(R.jailFine)}` : null, 'fer servir la carta'].filter(Boolean);
    return `Si només hi caieu, esteu de visita. Per sortir de la presó: ${ways.join(', ')}. Com a molt s'hi passen ${R.jailMaxTurns} torns.`;
  },
  parking: () => (G.rules().parkingPot ? `Qui hi cau s'emporta el pot: ara hi ha ${G.money(S().pot)}.` : 'Casella de descans: no passa res.'),
  gotojail: () => 'Qui hi cau va directament a la presó, sense passar per la Sortida.',
  chance: () => `Qui hi cau agafa una carta ${G.rules().chanceDeck === 'good' ? 'bona' : G.rules().chanceDeck === 'bad' ? 'dolenta' : 'a l\'atzar (bona o dolenta)'}.`,
  tax: (s) => `Qui hi cau paga ${G.money(s.amount)}.`,
};

function squareModal(i) {
  const s = G.sq(i);
  if (!G.isBuyable(i)) {
    openModal({ title: esc(s.name), body: `<p class="lead">${SQUARE_HELP[s.type]?.(s) || ''}</p>` });
    return;
  }
  const o = G.ownerOf(i);
  openModal({
    title: esc(s.name),
    wide: true,
    body: `<div class="split">${deedHTML(i)}<div class="grow">
      <p class="lead">${o === null ? `Encara és del banc. Preu: ${G.money(s.price)}.` : `És de <b>${esc(G.team(o).name)}</b>. Lloguer ara: ${G.money(G.rentFor(i))}.`}</p>
      ${o !== null ? `<div class="plist">${propRow(i)}</div>` : ''}
      <div class="field" style="margin-top:16px"><span>Canviar l'amo a mà</span>${teamPick('own', o, { allowNone: true })}</div>
    </div></div>`,
    foot: `<button class="btn" type="button" data-a="auction" ${S().owners[i]?.houses ? 'disabled' : ''}>${icon('gavel')}Subhastar</button>`,
    onMount(d) {
      bindPropActions(d, () => squareModal(i));
      bindPick(d, 'own', (v) => { const err = G.setOwner(i, v); if (err) { toast(err); return; } dlg.dataset.keep = '1'; after().then(() => squareModal(i)); });
      d.querySelector('[data-a=auction]').addEventListener('click', () => { const err = G.startAuction(i); if (err) { toast(err); return; } dlg.close(); after(); });
    },
  });
}

// ---------- Historial ----------
function logModal() {
  const fmt = (t) => new Date(t).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
  openModal({
    title: 'Historial de la partida',
    body: `<ul class="log-list">${S().log.map((l) => `<li><time>${fmt(l.t)}</time><span class="${l.kind}">${esc(l.text)}</span></li>`).join('')}</ul>`,
  });
}

// ---------- Configuració ----------
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 320;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No és una imatge.')); };
    img.src = url;
  });
}

function settingsModal(tab = 'teams') {
  const draft = clone(S().config);
  const teams = S().teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  const tabs = { teams: 'Equips', board: 'Tauler', cards: 'Cartes', rules: 'Regles', sounds: 'Sons', game: 'Partida' };
  const soundsHTML = () => `<p class="note">Escolteu cada so amb el botó. Els que no us agradin, els podeu apagar; es guarda al moment en aquest ordinador.</p>
    <label class="field"><span>Volum general</span><input type="range" id="vol" data-vol min="0" max="100" value="${Math.round(getVolume() * 100)}"></label>
    <div class="snd-list">${Object.entries(SOUNDS).map(([k, s]) => `<div class="snd">
      <button class="btn snd-play" type="button" data-play="${k}" aria-label="Escoltar ${esc(s.name)}">${icon('volume')}</button>
      <div><b>${esc(s.name)}</b><div class="muted">${esc(s.when)}</div></div>
      <label class="check"><input type="checkbox" data-soff="${k}" ${isOff(k) ? '' : 'checked'}> Actiu</label>
    </div>`).join('')}</div>`;

  const teamsHTML = () => `<p class="note">Les fotos només es guarden en aquest navegador: no es pugen a internet. Si canvieu d'ordinador, les haureu de tornar a posar.</p>
    <div class="cfg-grid">${teams.map((t, k) => `<div class="cfg-team">
      <label class="cfg-photo" style="${avatarStyle({ ...t })}" title="Canviar la foto">${photoOf(t.id) ? '' : icon('camera')}
        <input type="file" accept="image/*" data-photo="${k}" aria-label="Foto de ${esc(t.name)}"></label>
      <div class="field" style="margin:0"><span>Nom</span><input type="text" data-tname="${k}" value="${esc(t.name)}" maxlength="28"></div>
      <div class="row"><input type="color" data-tcolor="${k}" value="${t.color}" aria-label="Color">${photoOf(t.id) ? `<button class="btn btn-ghost" type="button" data-nophoto="${k}">Treure foto</button>` : ''}</div>
    </div>`).join('')}</div>`;

  const per = draft.board.length / 4;
  const sides = ['Costat de baix', "Costat de l'esquerra", 'Costat de dalt', 'Costat de la dreta'];
  const boardHTML = () => `<p class="note">Cada moni s'encarrega d'un costat: 4 propietats i 1 estació. El lloguer són sis números separats per comes: sense cases, amb 1, 2, 3 i 4 cases, i amb hotel.</p>
    <div class="cfg-sq cfg-head"><span></span><span></span><span>Nom</span><span>Preu</span><span>Lloguers</span></div>
    ${draft.board.map((s, i) => {
    const color = s.type === 'prop' ? draft.groups[s.group]?.color : s.type === 'station' ? 'var(--ink)' : 'transparent';
    const editable = ['prop', 'station', 'tax', 'chance', 'go', 'jail', 'parking', 'gotojail'].includes(s.type);
    const head = i % per === 1 ? `<h3 class="cfg-side">${sides[Math.floor(i / per)]} <span class="muted">(caselles ${i} a ${i + per - 2})</span></h3>` : i % per === 0 ? '<h3 class="cfg-side">Cantonada</h3>' : '';
    return editable ? `${head}<div class="cfg-sq"><span class="n">${i}</span><span class="sw" style="--g:${color}"></span>
      <input type="text" data-sname="${i}" value="${esc(s.name)}" aria-label="Nom de la casella ${i}">
      ${s.type === 'prop' || s.type === 'station' ? `<input type="number" data-sprice="${i}" value="${s.price}" min="0" step="10" aria-label="Preu">` : s.type === 'tax' ? `<input type="number" data-samount="${i}" value="${s.amount}" min="0" step="10" aria-label="Multa">` : '<span></span>'}
      ${s.type === 'prop' ? `<input type="text" class="rent" data-srent="${i}" value="${s.rent.join(', ')}" aria-label="Lloguers">` : '<span></span>'}
    </div>` : '';
  }).join('')}`;

  const cardsHTML = () => ['good', 'bad'].map((deck) => `<h3 class="label" style="margin-top:12px">${esc(deckName(draft.rules, deck))} (${draft.cards[deck].length} cartes)</h3>
    ${draft.cards[deck].map((c, k) => `<div class="cfg-card">
      <textarea data-ctext="${deck}:${k}" aria-label="Text de la carta">${esc(c.text)}</textarea>
      <select data-ceff="${deck}:${k}" aria-label="Efecte">${Object.entries(EFFECTS).map(([v, l]) => `<option value="${v}" ${v === c.effect ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input type="number" data-cval="${deck}:${k}" value="${c.value}" aria-label="Valor">
      <button class="icon-btn m-close" type="button" data-cdel="${deck}:${k}" aria-label="Esborrar carta">${icon('trash')}</button>
    </div>`).join('')}
    <button class="btn" type="button" data-cadd="${deck}" style="margin-top:10px">${icon('plus')}Afegir carta a ${esc(deckName(draft.rules, deck))}</button>`).join('');

  const r = draft.rules;
  const rulesHTML = () => `<div class="cfg-rules">
      <label class="field"><span>Diners per començar</span><input type="number" data-r="startMoney" value="${r.startMoney}" step="50"></label>
      <label class="field"><span>Cobrar a la Sortida</span><input type="number" data-r="goSalary" value="${r.goSalary}" step="10"></label>
      <label class="field"><span>Pagar per sortir de la presó</span><input type="number" data-r="jailFine" value="${r.jailFine}" step="10"></label>
      <label class="field"><span>Número per sortir de la presó</span><input type="number" data-r="jailExitRoll" value="${r.jailExitRoll}" min="1" max="12"></label>
      <label class="field"><span>Torns màxims a la presó</span><input type="number" data-r="jailMaxTurns" value="${r.jailMaxTurns}" min="1" max="10"></label>
      <label class="check"><input type="checkbox" data-r="jailPay" ${r.jailPay ? 'checked' : ''}> Es pot pagar per sortir</label>
      <label class="check"><input type="checkbox" data-r="jailRoll" ${r.jailRoll ? 'checked' : ''}> Es pot sortir traient el número</label>
      <label class="field"><span>Dau</span><select data-r="maxDie"><option value="6" ${r.maxDie === 6 ? 'selected' : ''}>Un dau (1 a 6)</option><option value="12" ${r.maxDie === 12 ? 'selected' : ''}>Dos daus (2 a 12)</option></select></label>
      <label class="field"><span>Moneda</span><input type="text" data-r="currency" value="${esc(r.currency)}" maxlength="6"></label>
      <label class="field"><span>Nom del mall de cartes que guanya</span><input type="text" data-r="goodName" value="${esc(r.goodName)}" maxlength="22"></label>
      <label class="field"><span>Nom del mall de cartes que perd</span><input type="text" data-r="badName" value="${esc(r.badName)}" maxlength="22"></label>
    </div>
    <p class="muted">Els diners per començar s'apliquen quan es comença una partida nova.</p>`;

  const gameHTML = () => `<p class="lead">La partida es desa sola en aquest navegador a cada pas. Si voleu passar-la a un altre ordinador, descarregueu-la i carregueu-la allà.</p>
    <div class="row" style="justify-content:flex-start">
      <button class="btn" type="button" data-g="export">Descarregar la partida</button>
      <label class="btn">Carregar una partida<input type="file" accept="application/json,.json" data-g="import" hidden></label>
    </div>
    <h3 class="label" style="margin-top:24px">Partida nova</h3>
    <p class="muted">Torna a posar tots els equips a la Sortida amb els diners inicials i sense propietats. Es mantenen els noms, les fotos, el tauler i les cartes.</p>
    <button class="btn btn-danger" type="button" data-g="new">Començar una partida nova</button>
    <h3 class="label" style="margin-top:24px">Contingut d'exemple</h3>
    <p class="muted">Torna a posar el tauler i les cartes d'exemple (perdreu els que hàgiu escrit).</p>
    <button class="btn" type="button" data-g="defaults">Recuperar el tauler i les cartes d'exemple</button>`;

  const views = { teams: teamsHTML, board: boardHTML, cards: cardsHTML, rules: rulesHTML, sounds: soundsHTML, game: gameHTML };
  let current = tab;

  openModal({
    title: 'Configuració',
    wide: true,
    body: '<div id="cfgBody"></div>',
    foot: '<span class="muted">Els canvis no s\'apliquen fins que els deseu.</span><span class="spacer"></span><button class="btn btn-primary" type="button" data-a="save">Desar els canvis</button>',
    onMount(d) {
      const head = d.querySelector('.m-head');
      head.insertAdjacentHTML('afterend', `<div class="tabs" role="tablist">${Object.entries(tabs).map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === current}">${l}</button>`).join('')}</div>`);
      const bodyEl = d.querySelector('#cfgBody');
      const show = () => {
        bodyEl.innerHTML = views[current]();
        d.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === current)));
      };
      d.querySelector('.tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (!b) return;
        current = b.dataset.tab;
        show();
      });
      show();

      bodyEl.addEventListener('input', (e) => {
        const el = e.target;
        const ds = el.dataset;
        if (ds.tname !== undefined) teams[ds.tname].name = el.value;
        if (ds.tcolor !== undefined) teams[ds.tcolor].color = el.value;
        if (ds.sname !== undefined) draft.board[ds.sname].name = el.value;
        if (ds.sprice !== undefined) draft.board[ds.sprice].price = Math.max(0, Number(el.value) || 0);
        if (ds.samount !== undefined) draft.board[ds.samount].amount = Math.max(0, Number(el.value) || 0);
        if (ds.srent !== undefined) {
          const nums = el.value.split(/[,;\s]+/).filter(Boolean).map(Number);
          if (nums.length === 6 && nums.every((n) => Number.isFinite(n))) { draft.board[ds.srent].rent = nums; el.style.borderColor = ''; } else el.style.borderColor = 'var(--bad)';
        }
        const card = (key) => { const [dk, k] = key.split(':'); return draft.cards[dk][Number(k)]; };
        if (ds.ctext !== undefined) card(ds.ctext).text = el.value;
        if (ds.ceff !== undefined) card(ds.ceff).effect = el.value;
        if (ds.cval !== undefined) card(ds.cval).value = Number(el.value) || 0;
        if (ds.r !== undefined) {
          const key = ds.r;
          if (el.type === 'checkbox') r[key] = el.checked;
          else if (['currency', 'chanceDeck', 'goodName', 'badName'].includes(key)) r[key] = el.value;
          else r[key] = Number(el.value) || 0;
        }
      });

      bodyEl.addEventListener('change', async (e) => {
        const el = e.target;
        if (el.dataset.photo !== undefined && el.files[0]) {
          try {
            setPhoto(teams[el.dataset.photo].id, await resizePhoto(el.files[0]));
            show();
            full();
          } catch (err) { toast(err.message); }
        }
        if (el.dataset.g === 'import' && el.files[0]) {
          try {
            G.importGame(await el.files[0].text());
            buildBoard();
            dlg.close();
            full();
            toast('Partida carregada.');
          } catch (err) { toast(err.message || 'No s\'ha pogut llegir el fitxer.'); }
        }
      });

      // pestanya Sons: s'aplica al moment (no depèn de «Desar els canvis»)
      bodyEl.addEventListener('input', (e) => { if (e.target.dataset.vol !== undefined) setVolume(Number(e.target.value) / 100); });
      bodyEl.addEventListener('change', (e) => { if (e.target.dataset.soff !== undefined) setOff(e.target.dataset.soff, !e.target.checked); });
      bodyEl.addEventListener('click', (e) => { const p = e.target.closest('[data-play]'); if (p) preview(p.dataset.play); });
      bodyEl.addEventListener('click', (e) => {
        const el = e.target.closest('button');
        if (!el) return;
        const ds = el.dataset;
        if (ds.nophoto !== undefined) { setPhoto(teams[ds.nophoto].id, ''); show(); full(); }
        if (ds.cdel !== undefined) {
          const [dk, k] = ds.cdel.split(':');
          if (draft.cards[dk].length <= 1) { toast('Cal deixar com a mínim una carta.'); return; }
          draft.cards[dk].splice(Number(k), 1);
          show();
        }
        if (ds.cadd !== undefined) {
          draft.cards[ds.cadd].push({ text: '', effect: 'money', value: ds.cadd === 'good' ? 100 : -100 });
          show();
          bodyEl.querySelector(`[data-ctext="${ds.cadd}:${draft.cards[ds.cadd].length - 1}"]`)?.focus();
        }
        if (ds.g === 'export') {
          const blob = new Blob([G.exportGame()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `monopoli-cau-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
        if (ds.g === 'new') {
          if (!confirm('Començar una partida nova? Es perdrà la partida actual (abans la podeu descarregar).')) return;
          G.state.config = clone(draft);
          G.state.teams.forEach((t, k) => { t.name = teams[k].name; t.color = teams[k].color; });
          G.newGame(draft, S().teams);
          buildBoard();
          dlg.close();
          full();
          setupModal();
        }
        if (ds.g === 'defaults') {
          if (!confirm('Recuperar el tauler i les cartes d\'exemple? Es perdran els que hàgiu escrit.')) return;
          const def = G.defaultConfig();
          draft.board = def.board;
          draft.cards = def.cards;
          draft.groups = clone(GROUPS);
          toast('Recuperat. Deseu els canvis per aplicar-ho.');
        }
      });

      d.querySelector('[data-a=save]').addEventListener('click', () => {
        draft.cards.good = draft.cards.good.filter((c) => c.text.trim());
        draft.cards.bad = draft.cards.bad.filter((c) => c.text.trim());
        if (!draft.cards.good.length || !draft.cards.bad.length) { toast('Cada mall ha de tenir com a mínim una carta amb text.'); return; }
        G.updateConfig((st) => {
          st.config = draft;
          st.teams.forEach((t, k) => { t.name = teams[k].name.trim() || t.name; t.color = teams[k].color; });
        });
        dlg.close();
        buildBoard();
        full();
        toast('Canvis desats.');
      });
    },
  });
}

// ---------- Preparar la partida ----------
function setupModal() {
  const r = G.rules();
  const teams = S().teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
  const vals = {
    startMoney: r.startMoney, goSalary: r.goSalary,
    jailPay: r.jailPay, jailFine: r.jailFine, jailRoll: r.jailRoll, jailExitRoll: r.jailExitRoll, jailMaxTurns: r.jailMaxTurns,
  };
  const body = () => `<p class="lead">Poseu el nom i el color de cada equip i, si voleu, una foto. Després, els diners.</p>
    <div class="cfg-grid setup-grid">${teams.map((t, k) => `<div class="cfg-team" style="--tc:${t.color}">
      <label class="cfg-photo" style="${avatarStyle(t)}" title="Posar una foto">${photoOf(t.id) ? '' : icon('camera')}
        <input type="file" accept="image/*" data-photo="${k}" aria-label="Foto de l'equip ${k + 1}"></label>
      <div class="field" style="margin:0"><span>Equip ${k + 1}</span><input type="text" data-tname="${k}" value="${esc(t.name)}" maxlength="28"></div>
      <input type="color" data-tcolor="${k}" value="${t.color}" aria-label="Color de l'equip ${k + 1}">
    </div>`).join('')}</div>
    <div class="cfg-rules" style="margin-top:18px">
      <label class="field"><span>Diners per començar</span><input type="number" data-r="startMoney" value="${vals.startMoney}" step="50" min="0"></label>
      <label class="field"><span>Cobrar en passar per la Sortida</span><input type="number" data-r="goSalary" value="${vals.goSalary}" step="10" min="0"></label>
      <label class="field"><span>Torns màxims a la presó</span><input type="number" data-r="jailMaxTurns" value="${vals.jailMaxTurns}" step="1" min="1" max="10"></label>
    </div>
    <div class="jail-rules">
      <div class="jr"><label class="check"><input type="checkbox" data-r="jailPay" ${vals.jailPay ? 'checked' : ''}> Es pot pagar per sortir de la presó</label>
        <label class="jr-val" ${vals.jailPay ? '' : 'hidden'}><span>Quant</span><input type="number" data-r="jailFine" value="${vals.jailFine}" step="10" min="0"></label></div>
      <div class="jr"><label class="check"><input type="checkbox" data-r="jailRoll" ${vals.jailRoll ? 'checked' : ''}> Es pot sortir traient un número amb el dau</label>
        <label class="jr-val" ${vals.jailRoll ? '' : 'hidden'}><span>Número</span><input type="number" data-r="jailExitRoll" value="${vals.jailExitRoll}" step="1" min="1" max="12"></label></div>
      <p class="muted">La carta de ${esc(deckName(r, 'good'))} per quedar lliure de la presó sempre funciona.${!vals.jailPay && !vals.jailRoll ? ` Sense cap opció, se surt després de ${vals.jailMaxTurns} torns.` : ''}</p>
    </div>
    <div class="cfg-team" style="--tc:#FFB020;margin-top:8px;grid-template-columns:64px 1fr auto">
      <label class="cfg-photo" style="width:64px;height:64px;--tc:#FFB020;${photoOf('jail') ? `background-image:url(${photoOf('jail')})` : ''}" title="Foto per a la presó">${photoOf('jail') ? '' : icon('lock')}
        <input type="file" accept="image/*" data-photo="jail" aria-label="Foto per a la presó"></label>
      <div><b>Foto per a la presó</b><div class="muted">Opcional: la cara d'un moni darrere els barrots.</div></div>
      ${photoOf('jail') ? '<button class="btn btn-ghost" type="button" data-nojail>Treure</button>' : '<span></span>'}
    </div>
    <p class="muted" style="margin-top:14px">Les fotos es guarden només en aquest ordinador; no es pugen a internet. Les cartes, el tauler i la resta de regles són a Configuració.</p>`;
  openModal({
    title: 'Preparem la partida',
    wide: true,
    body: '<div id="setupBody"></div>',
    foot: '<button class="btn btn-ghost" type="button" data-a="adv">Configuració avançada</button><span class="spacer"></span><button class="btn btn-primary btn-big" type="button" data-a="go">Començar la partida</button>',
    onMount(d) {
      const box = d.querySelector('#setupBody');
      const show = () => { box.innerHTML = body(); };
      show();
      box.addEventListener('input', (e) => {
        const ds = e.target.dataset;
        if (ds.tname !== undefined) teams[ds.tname].name = e.target.value;
        if (ds.tcolor !== undefined) { teams[ds.tcolor].color = e.target.value; show(); }
        if (ds.r !== undefined) {
          if (e.target.type === 'checkbox') { vals[ds.r] = e.target.checked; show(); } else vals[ds.r] = Math.max(0, Math.round(Number(e.target.value) || 0));
        }
      });
      box.addEventListener('change', async (e) => {
        const el = e.target;
        if (el.dataset.photo === undefined || !el.files[0]) return;
        try {
          const url = await resizePhoto(el.files[0]);
          const id = el.dataset.photo === 'jail' ? 'jail' : teams[el.dataset.photo].id;
          if (!setPhoto(id, url)) toast("No s'ha pogut desar la foto: el navegador no té espai.");
          show();
          if (id === 'jail') buildBoard();
          full();
        } catch (err) { toast(err.message); }
      });
      box.addEventListener('click', (e) => {
        if (e.target.closest('[data-nojail]')) { setPhoto('jail', ''); show(); buildBoard(); full(); }
      });
      d.querySelector('[data-a=adv]').addEventListener('click', () => settingsModal('rules'));
      d.querySelector('[data-a=go]').addEventListener('click', () => {
        G.startGame({ teams, rules: vals });
        dlg.close();
        buildBoard();
        full();
        toast(`Comença ${G.current().name}. Tireu el dau!`);
      });
    },
  });
}

// ---------- Accions de la barra i del tauler ----------
async function doUndo() {
  if (busyNow()) return;
  if (G.undo()) {
    S3.dropCard(true); // cap carta no es pot quedar surant d'una acció desfeta
    if (dlg.open) dlg.close();
    buildBoard();
    full();
    toast("S'ha desfet l'últim pas.");
    openQueue();
  }
}

function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Aquest navegador no deixa posar pantalla completa.'));
}

const ACTIONS = {
  minigame: minigameModal,
  money: () => moneyModal(),
  trade: tradeModal,
  auction: auctionPicker,
  undo: doUndo,
  log: logModal,
  settings: () => settingsModal(),
  fullscreen,
  mute: () => { toggleMute(); full(); },
  endturn: () => { const err = G.endTurn(); if (err) { toast(err); teamModal(G.state.turn); return; } after(); },
  payjail: () => { const err = G.payJail(); if (err) { toast(err); return; } after(); },
  jailcard: () => { G.useJailCard(); after(); },
  resume: openQueue,
  setup: setupModal,
  restart: restartModal,
  finish: finishModal,
};

// Final per temps: classificació per patrimoni (efectiu + valor de les propietats + cases)
function finishModal() {
  const rows = S().teams.map((t, k) => {
    const props = G.propsOf(k);
    const land = props.reduce((s, i) => s + (S().owners[i].mortgaged ? G.sq(i).price / 2 : G.sq(i).price), 0);
    const build = props.reduce((s, i) => s + (S().owners[i].houses || 0) * (G.sq(i).house || 0), 0);
    return { k, t, cash: t.money, land, build, total: t.money + land + build };
  }).sort((a, b) => (a.t.bankrupt - b.t.bankrupt) || (b.total - a.total));
  const podium = [rows[1], rows[0], rows[2]].map((r, j) => (r ? `<div class="pod pod-${[2, 1, 3][j]}" style="--tc:${r.t.color}">
      <span class="pod-av" style="${avatarStyle(r.t)}">${avatarText(r.t)}</span>
      <b>${esc(r.t.name)}</b><span>${G.money(r.total)}</span>
      <div class="pod-step">${[2, 1, 3][j]}</div></div>` : '<div></div>')).join('');
  openModal({
    title: 'Classificació',
    wide: true,
    body: `<div class="podium">${podium}</div>
      <table class="rank"><thead><tr><th></th><th>Equip</th><th>Efectiu</th><th>Propietats</th><th>Cases</th><th>Total</th></tr></thead><tbody>
      ${rows.map((r, j) => `<tr class="${r.t.bankrupt ? 'out' : ''}"><td>${r.t.bankrupt ? '—' : j + 1}</td><td><span class="rank-sw" style="--tc:${r.t.color}"></span>${esc(r.t.name)}${r.t.bankrupt ? ' (fallida)' : ''}</td><td>${G.money(r.cash)}</td><td>${G.money(r.land)}</td><td>${G.money(r.build)}</td><td><b>${G.money(r.total)}</b></td></tr>`).join('')}
      </tbody></table>
      <p class="muted">Les propietats hipotecades compten la meitat. Les cases compten el que van costar.</p>`,
    foot: `<button class="btn btn-ghost" type="button" data-close-btn>Seguir jugant</button><span class="spacer"></span>
      <button class="btn btn-primary btn-big" type="button" data-a="go">${icon('trophy')}Acabar i proclamar ${esc(rows[0].t.name)}</button>`,
    onMount(d) {
      d.querySelector('[data-close-btn]').addEventListener('click', () => dlg.close());
      d.querySelector('[data-a=go]').addEventListener('click', () => { G.finishGame(rows[0].k); after(); });
    },
  });
}

function restartModal() {
  openModal({
    title: 'Reiniciar la partida?',
    body: `<p class="lead">Tots els equips tornaran a la Sortida amb els diners inicials i sense propietats. Això no es pot desfer.</p>
      <p class="muted">Es mantenen els noms, les fotos, el tauler i les cartes. Després podreu revisar els equips i els diners abans de començar.</p>`,
    foot: '<button class="btn btn-ghost" type="button" data-close-btn>Cancel·lar</button><span class="spacer"></span><button class="btn btn-danger" type="button" data-a="go">Sí, reiniciar</button>',
    onMount(d) {
      d.querySelector('[data-close-btn]').addEventListener('click', () => dlg.close());
      d.querySelector('[data-a=go]').addEventListener('click', () => {
        G.newGame(S().config, S().teams);
        S3.dropCard(true);
        dlg.close();
        buildBoard();
        full();
        setupModal();
      });
    },
  });
}

// accions que es poden fer encara que hi hagi una animació en marxa
const ALWAYS = new Set(['mute', 'fullscreen', 'log']);

document.addEventListener('click', (e) => {
  if (dlg.contains(e.target)) return;
  const act = e.target.closest('[data-act]');
  // mentre es mou alguna cosa (fitxes, diners, una carta girant-se) no es pot tocar res del joc
  if (busyNow() && !(act && ALWAYS.has(act.dataset.act))) return;
  if (act) {
    if (act.disabled) return;
    ACTIONS[act.dataset.act]?.();
    return;
  }
  const roll = e.target.closest('[data-roll]');
  if (roll && !roll.disabled) { G.roll(Number(roll.dataset.roll)); after(); return; }
  const t = e.target.closest('[data-team]');
  if (t) { teamModal(Number(t.dataset.team)); return; }
  if (e.target.closest('#ticker')) logModal();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (dlg.open && e.target.matches('input, textarea')) return;
    e.preventDefault();
    doUndo();
    return;
  }
  if (dlg.open || e.target.matches('input, textarea, select') || busyNow()) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 9 && G.state.phase === 'roll' && !G.state.queue.length && n <= G.rules().maxDie) {
    G.roll(n);
    after();
  } else if (e.key === 'Enter' && G.state.phase === 'end' && !G.state.queue.length) {
    e.preventDefault();
    ACTIONS.endturn();
  }
});

// ---------- Arrencada ----------
setMutedRef(isMuted);
G.load();
const boardHandlers = {
  onSquare: (i) => { if (!busyNow()) squareModal(i); },
  onDeck: (d) => {
    if (busyNow()) return;
    // si hi ha alguna cosa pendent, primer s'ha de resoldre: si no, sortiria abans aquella carta
    if (S().queue.length) { toast('Primer cal resoldre l\'acció pendent: premeu «Continuar».'); return; }
    deckModal(d);
  },
};
// el tauler es dibuixa amb les fonts: esperem que arribin (amb un límit per si no hi ha internet)
Promise.race([
  Promise.all([
    document.fonts.load('800 64px Anybody'),
    document.fonts.load('900 64px Anybody'),
    document.fonts.load('700 20px "Atkinson Hyperlegible"'),
  ]),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {}).finally(() => {
  buildBoard(boardHandlers);
  full();
  // si la partida no ha començat (o encara ningú ha tirat), es mostra la preparació
  const st = S();
  const untouched = st.round === 1 && st.turn === 0 && !st.lastRoll && !Object.keys(st.owners).length && st.log.length <= 1;
  if (!st.started || untouched) setupModal();
  else openQueue();
});

// per depurar des de la consola
window.__monopoli = { G, renderAll: full, renderSquares, renderTeams, scene: S3, handlers: boardHandlers, busyNow };
