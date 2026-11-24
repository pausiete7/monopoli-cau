// Jugadors automàtics que juguen amb el motor real (js/engine.js).
// S'usen per mesurar l'economia (sim/economy.mjs) i per buscar errors (sim/fuzz.mjs).
import * as G from '../js/engine.js';

G.opts.persist = false;

export const rnd = (n) => Math.floor(Math.random() * n);
export const S = () => G.state;

// Comprova que l'estat té sentit. Torna una llista de problemes.
export function invariants(tag = '') {
  const st = G.state;
  const errs = [];
  const N = st.config.board.length;
  st.teams.forEach((t, k) => {
    if (!Number.isFinite(t.money)) errs.push(`${tag} equip ${k} diners no numèrics: ${t.money}`);
    if (!Number.isInteger(t.pos) || t.pos < 0 || t.pos >= N) errs.push(`${tag} equip ${k} posició fora del tauler: ${t.pos}`);
    if (t.bankrupt && G.propsOf(k).length) errs.push(`${tag} equip ${k} en fallida però amb propietats`);
    if (t.jailCards < 0) errs.push(`${tag} equip ${k} cartes de presó negatives`);
    if (t.jail && st.config.board[t.pos].type !== 'jail') errs.push(`${tag} equip ${k} a la presó però no és a la casella de presó (pos ${t.pos})`);
  });
  Object.entries(st.owners).forEach(([i, o]) => {
    const s = st.config.board[i];
    if (!s || !['prop', 'station'].includes(s.type)) errs.push(`${tag} amo a una casella no comprable ${i}`);
    if (o.team < 0 || o.team >= st.teams.length) errs.push(`${tag} amo inexistent a ${i}`);
    if (o.houses < 0 || o.houses > 5) errs.push(`${tag} cases fora de rang a ${i}: ${o.houses}`);
    if (o.houses && s.type !== 'prop') errs.push(`${tag} cases en una estació ${i}`);
    if (o.houses && o.mortgaged) errs.push(`${tag} cases en una propietat hipotecada ${i}`);
    if (o.houses && !G.ownsGroup(o.team, s.group)) errs.push(`${tag} cases sense tenir el grup sencer a ${i}`);
  });
  if (st.turn < 0 || st.turn >= st.teams.length) errs.push(`${tag} torn invàlid ${st.turn}`);
  if (st.teams[st.turn]?.bankrupt && st.winner === undefined && G.activeTeams().length > 1) errs.push(`${tag} el torn és d'un equip en fallida`);
  ['good', 'bad'].forEach((d) => st.decks[d].forEach((c) => { if (c < 0 || c >= st.config.cards[d].length) errs.push(`${tag} carta inexistent al mall ${d}: ${c}`); }));
  st.queue.forEach((q) => { if (q.team !== undefined && st.teams[q.team]?.bankrupt) errs.push(`${tag} acció pendent d'un equip en fallida`); });
  return errs;
}

// ---------- Estratègia ----------
export const STRATS = {
  // compra si li queda un coixí; construeix quan pot
  normal: { reserve: 150, buildReserve: 250, bidFactor: 1.0, payJailMin: 300 },
  // gasta-ho tot
  agressiu: { reserve: 0, buildReserve: 50, bidFactor: 1.3, payJailMin: 100 },
  // estalviador
  prudent: { reserve: 400, buildReserve: 600, bidFactor: 0.7, payJailMin: 800 },
};

// treu diners si està en negatiu: ven cases i hipoteca (primer el més barat)
export function raise(t) {
  for (let guard = 0; guard < 60 && G.team(t).money < 0; guard++) {
    const props = G.propsOf(t);
    const withHouse = props.filter((i) => S().owners[i].houses > 0)
      .sort((a, b) => S().owners[b].houses - S().owners[a].houses);
    if (withHouse.length) { if (G.sellHouse(withHouse[0])) break; continue; }
    const free = props.filter((i) => !S().owners[i].mortgaged).sort((a, b) => G.sq(a).price - G.sq(b).price);
    if (!free.length) break;
    if (G.toggleMortgage(free[0])) break;
  }
}

function manage(t, st) {
  const T = G.team(t);
  // aixecar hipoteques si sobren diners
  G.propsOf(t).filter((i) => S().owners[i].mortgaged).forEach((i) => {
    if (T.money > G.sq(i).price + st.buildReserve) G.toggleMortgage(i);
  });
  // construir, sempre igualat
  for (let guard = 0; guard < 40; guard++) {
    const cands = G.propsOf(t).filter((i) => !G.canBuild(i) && T.money - G.sq(i).house >= st.buildReserve);
    if (!cands.length) break;
    cands.sort((a, b) => S().owners[a].houses - S().owners[b].houses);
    if (G.build(cands[0])) break;
  }
}

export function settle(stats) {
  // resol cues (compres, subhastes, cartes) i paga deutes
  for (let guard = 0; guard < 50 && S().queue.length; guard++) {
    const q = S().queue[0];
    if (q.type === 'buy') {
      const st = STRATS[stats.strat[q.team]];
      const T = G.team(q.team);
      const price = G.sq(q.sq).price;
      if (T.money - price >= st.reserve) { G.buy(q.sq, q.team); stats.buys++; } else G.startAuction(q.sq);
    } else if (q.type === 'auction') {
      const owner = G.ownerOf(q.sq);
      const price = G.sq(q.sq).price;
      // subhasta anglesa: guanya qui valora més i paga el segon preu + 10
      const vals = G.activeTeams().filter((k) => k !== owner).map((k) => {
        const st = STRATS[stats.strat[k]];
        const cap = Math.max(0, G.team(k).money - st.reserve);
        return { k, v: Math.min(cap, Math.round(price * st.bidFactor * (0.6 + Math.random() * 0.6))) };
      }).filter((x) => x.v >= 10).sort((a, b) => b.v - a.v);
      if (vals.length) {
        const pay = Math.min(vals[0].v, (vals[1]?.v || 0) + 10);
        if (G.auctionWin(q.sq, vals[0].k, Math.max(10, pay))) G.dismissQueueItem();
        stats.auctions++;
      } else { G.dismissQueueItem(); stats.auctionNone++; }
    } else if (q.type === 'card') {
      G.applyCard();
      stats.cards++;
    } else G.dismissQueueItem();
    G.state.teams.forEach((T, k) => { if (T.money < 0 && !T.bankrupt) raise(k); });
    G.checkBankrupt();
  }
}

// Intercanvis senzills, com farien els equips: completar grups de color
export function tryTrade(t, stats) {
  const groups = Object.keys(G.state.config.groups);
  const T = G.team(t);
  for (const g of groups) {
    const sqs = G.groupSquares(g);
    const mine = sqs.filter((i) => G.ownerOf(i) === t);
    if (mine.length !== sqs.length - 1) continue;
    const missing = sqs.find((i) => G.ownerOf(i) !== t);
    const o = G.ownerOf(missing);
    if (o === null || o === t || G.team(o).bankrupt) continue;
    if (sqs.some((i) => G.state.owners[i]?.houses)) continue;
    // 1) intercanvi que completa grups als dos equips
    for (const g2 of groups) {
      if (g2 === g) continue;
      const s2 = G.groupSquares(g2);
      const theirs = s2.filter((i) => G.ownerOf(i) === o);
      if (theirs.length !== s2.length - 1) continue;
      const want = s2.find((i) => G.ownerOf(i) !== o);
      if (G.ownerOf(want) !== t || s2.some((i) => G.state.owners[i]?.houses)) continue;
      G.trade({ a: t, b: o, aProps: [want], bProps: [missing], aMoney: 0, bMoney: 0 });
      stats.trades++;
      return;
    }
    // 2) compra amb diners si l'altre no la necessita per a un grup seu
    const st = STRATS[stats.strat[t]];
    const offer = Math.round(G.sq(missing).price * 1.8);
    if (Math.random() < 0.35 && T.money - offer > st.reserve) {
      G.trade({ a: t, b: o, aProps: [], bProps: [missing], aMoney: offer, bMoney: 0 });
      stats.trades++;
      return;
    }
  }
}

// Juga un torn sencer de l'equip a qui li toca
export function playTurn(stats) {
  settle(stats); // cartes pendents d'un minijoc, abans de tirar
  if (G.state.winner !== undefined) return;
  const t = S().turn;
  const T = G.team(t);
  const st = STRATS[stats.strat[t]];
  if (T.jail) {
    if (T.jailCards) { G.useJailCard(); stats.jailCardsUsed++; } else if (G.rules().jailPay && T.money > st.payJailMin) { G.payJail(); stats.jailPaid++; }
  }
  const n = 1 + rnd(G.rules().maxDie > 6 ? 6 : 6) + (G.rules().maxDie > 6 ? 1 + rnd(6) : 0);
  G.roll(n);
  settle(stats);
  G.state.teams.forEach((x, k) => { if (x.money < 0 && !x.bankrupt) raise(k); });
  G.checkBankrupt();
  if (G.state.winner !== undefined) return;
  if (!G.team(t).bankrupt && stats.tradeOn) tryTrade(t, stats);
  if (!G.team(t).bankrupt) manage(t, st);
  let err = G.endTurn();
  if (err) {
    raise(t);
    G.checkBankrupt();
    err = G.endTurn();
    if (err) stats.stuck++;
  }
  settle(stats);
  G.fx.length = 0;
}

// Minijoc: dist = { equip: n }
export function minigame(mode) {
  const act = G.activeTeams();
  const order = act.slice().sort(() => Math.random() - 0.5);
  const dist = {};
  act.forEach((k) => { dist[k] = 0; });
  if (mode === 'restrictiu') { dist[order[0]] = 1; dist[order[order.length - 1]] = -1; }
  else if (mode === 'podi') { [2, 1, -1, -2].forEach((v, j) => { if (order[j] !== undefined) dist[order[j]] = v; }); }
  G.minigame(dist, 'sim');
}
