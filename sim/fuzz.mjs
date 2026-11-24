// Prova d'estrès: accions a l'atzar (també absurdes) sobre el motor real, comprovant que res es trenca
// i que «desfer» torna exactament a l'estat anterior.
// Ús: node sim/fuzz.mjs [partides=200] [accions=400]
import * as G from '../js/engine.js';
import { invariants, settle, raise, rnd, minigame } from './bot.mjs';

const GAMES = Number(process.argv[2] || 200);
const STEPS = Number(process.argv[3] || 400);
const problems = new Map();
const note = (k, detail) => { if (!problems.has(k)) problems.set(k, { n: 0, detail }); problems.get(k).n++; };

const pick = (a) => a[rnd(a.length)];
const buyable = () => G.state.config.board.map((s, i) => i).filter((i) => G.isBuyable(i));
const anyTeam = () => rnd(4);
const stats = { strat: ['normal', 'agressiu', 'prudent', 'normal'], buys: 0, auctions: 0, auctionNone: 0, cards: 0 };

const ACTIONS = {
  roll: () => G.roll(1 + rnd(6)),
  endTurn: () => G.endTurn(),
  settle: () => settle(stats),
  buy: () => { const q = G.state.queue[0]; if (q?.type === 'buy') G.buy(q.sq, q.team); },
  startAuction: () => G.startAuction(pick(buyable())),
  auctionWin: () => { const q = G.state.queue[0]; if (q?.type === 'auction') G.auctionWin(q.sq, anyTeam(), 10 + rnd(400)); },
  dismiss: () => { if (G.state.queue.length) G.dismissQueueItem(); },
  applyCard: () => G.applyCard(),
  drawCard: () => G.drawCard(anyTeam(), pick(['good', 'bad'])),
  minigame: () => minigame(pick(['restrictiu', 'podi'])),
  build: () => G.build(pick(buyable())),
  sell: () => G.sellHouse(pick(buyable())),
  mortgage: () => G.toggleMortgage(pick(buyable())),
  adjust: () => G.adjust(anyTeam(), (rnd(2) ? 1 : -1) * (10 + rnd(800)), 'fuzz', rnd(3) ? null : anyTeam()),
  setOwner: () => G.setOwner(pick(buyable()), rnd(5) === 0 ? null : anyTeam()),
  trade: () => {
    const a = anyTeam(); const b = (a + 1 + rnd(3)) % 4;
    G.trade({ a, b, aProps: G.propsOf(a).filter(() => rnd(2)), bProps: G.propsOf(b).filter(() => rnd(2)), aMoney: rnd(3) ? 0 : rnd(300), bMoney: rnd(3) ? 0 : rnd(300) });
  },
  place: () => G.placeTeam(anyTeam(), rnd(G.N()), !!rnd(2)),
  toggleJail: () => G.toggleJail(anyTeam()),
  jailCards: () => G.setJailCards(anyTeam(), rnd(3)),
  payJail: () => G.payJail(),
  useJailCard: () => G.useJailCard(),
  bankrupt: () => { if (rnd(8) === 0) G.bankrupt(anyTeam()); },
  revive: () => G.revive(anyTeam()),
  raise: () => raise(anyTeam()),
  checkBankrupt: () => G.checkBankrupt(),
  undo: () => G.undo(),
  config: () => G.updateConfig((st) => { if (rnd(2)) st.config.cards.good.pop(); else st.config.cards.bad.push({ text: 'x', effect: pick(['money', 'each', 'goto', 'move', 'jail', 'jailfree', 'repairs', 'skip', 'extra', 'text']), value: rnd(400) - 200 }); if (!st.config.cards.good.length) st.config.cards.good.push({ text: 'y', effect: 'money', value: 10 }); }),
};
const names = Object.keys(ACTIONS);

for (let g = 0; g < GAMES; g++) {
  G.newGame(G.defaultConfig());
  G.startGame({ teams: G.state.teams.map((t) => ({ name: t.name, color: t.color })), rules: { jailPay: !!rnd(2), jailRoll: !!rnd(2), jailMaxTurns: 1 + rnd(4) } });
  for (let s = 0; s < STEPS; s++) {
    const name = pick(names);
    const before = JSON.stringify(G.state);
    const depth = G.undoDepth();
    try {
      ACTIONS[name]();
    } catch (err) {
      note(`excepció a «${name}»: ${err.message}`, err.stack.split('\n').slice(1, 3).join(' | '));
      break;
    }
    G.fx.length = 0;
    const errs = invariants('');
    errs.forEach((e) => note(`invariant després de «${name}»: ${e.trim().replace(/\d+/g, 'N')}`, e));
    if (errs.length) break;
    // prova de desfer: si l'acció ha desat un punt de retorn, desfer ha de tornar exactament a abans
    if (name !== 'undo' && name !== 'settle' && name !== 'raise' && G.undoDepth() === depth + 1 && rnd(4) === 0) {
      G.undo();
      if (JSON.stringify(G.state) !== before) note(`desfer «${name}» no torna a l'estat d'abans`, '');
    }
    if (G.state.winner !== undefined && rnd(3) === 0) break;
  }
}

console.log(`\n== Prova d'estrès: ${GAMES} partides × ${STEPS} accions`);
if (!problems.size) console.log('Cap problema trobat.');
[...problems.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => console.log(`${String(v.n).padStart(5)}× ${k}${v.detail ? `\n        ${v.detail}` : ''}`));
