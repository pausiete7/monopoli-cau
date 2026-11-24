// Simula moltes partides i resumeix l'economia.
// Ús: node sim/economy.mjs [partides=500] [--start=1500] [--rent=1] [--price=1] [--house=1] [--go=200]
//      [--mg=1] (minijoc cada quantes rondes, 0 = cap) [--mode=restrictiu|podi] [--rounds=40] [--strat=mix|normal|agressiu|prudent]
import * as G from '../js/engine.js';
import { playTurn, minigame, invariants } from './bot.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : ['games', a];
}));
const GAMES = Number(args.games || 500);
const P = {
  start: Number(args.start || 1500),
  rent: Number(args.rent || 1),
  price: Number(args.price || 1),
  house: Number(args.house || 1),
  go: Number(args.go || 200),
  mg: Number(args.mg ?? 1),
  mode: args.mode || 'restrictiu',
  rounds: Number(args.rounds || 40),
  strat: args.strat || 'mix',
  trade: args.trade !== '0',
};

const CHECK = [5, 10, 15, 20, 25, 30];
const agg = { first: [], win: [], stuck: 0, errs: [], exc: [], buys: 0, auctions: 0, auctionNone: 0, cards: 0, jailPaid: 0, jailCardsUsed: 0, at: {} };
CHECK.forEach((r) => { agg.at[r] = { money: [], worth: [], spread: [], owned: [], houses: [], alive: [], neg: [] }; });

function config() {
  const c = G.defaultConfig();
  const curve = args.curve ? args.curve.split(',').map(Number) : null;
  if (args.station) c.rules.stationRent = args.station.split(',').map(Number);
  c.board.forEach((s) => {
    if (s.price) s.price = Math.round((s.price * P.price) / 10) * 10;
    if (s.rent) s.rent = s.rent.map((r, k) => Math.max(1, Math.round(r * P.rent * (curve ? curve[k] : 1))));
    if (s.house) s.house = Math.round((s.house * P.house) / 10) * 10;
  });
  if (!args.station) c.rules.stationRent = c.rules.stationRent.map((r) => Math.round(r * P.rent));
  return c;
}

for (let g = 0; g < GAMES; g++) {
  const stats = { strat: [], buys: 0, auctions: 0, auctionNone: 0, cards: 0, stuck: 0, jailPaid: 0, jailCardsUsed: 0, trades: 0, tradeOn: P.trade };
  const names = ['normal', 'agressiu', 'prudent'];
  for (let k = 0; k < 4; k++) stats.strat.push(P.strat === 'mix' ? names[(g + k) % 3] : P.strat);
  try {
    G.newGame(config());
    G.startGame({ teams: G.state.teams.map((t) => ({ name: t.name, color: t.color })), rules: { startMoney: P.start, goSalary: P.go } });
    let lastRound = 1;
    let firstBk = null;
    for (let turnN = 0; turnN < P.rounds * 6 && G.state.winner === undefined && G.state.round <= P.rounds; turnN++) {
      playTurn(stats);
      const e = invariants(`partida ${g} ronda ${G.state.round}:`);
      if (e.length) { agg.errs.push(...e); break; }
      if (firstBk === null && G.state.teams.some((t) => t.bankrupt)) firstBk = G.state.round;
      if (G.state.round !== lastRound) {
        // ha acabat una ronda
        if (P.mg && (lastRound % P.mg === 0)) { minigame(P.mode); /* les cartes es resolen al torn següent */ }
        if (CHECK.includes(lastRound)) {
          const a = agg.at[lastRound];
          const alive = G.activeTeams();
          const worths = alive.map((k) => G.netWorth(k));
          a.money.push(alive.reduce((s, k) => s + G.team(k).money, 0) / Math.max(1, alive.length));
          a.worth.push(worths.reduce((s, x) => s + x, 0) / Math.max(1, alive.length));
          a.spread.push(alive.length > 1 ? (Math.max(...worths) - Math.min(...worths)) / Math.max(1, worths.reduce((s, x) => s + x, 0) / alive.length) : 0);
          a.owned.push(Object.keys(G.state.owners).length / G.state.config.board.filter((s) => s.price).length);
          a.houses.push(Object.values(G.state.owners).reduce((s, o) => s + (o.houses || 0), 0));
          a.alive.push(alive.length);
          a.neg.push(alive.filter((k) => G.team(k).money < 0).length);
        }
        lastRound = G.state.round;
      }
    }
    agg.first.push(firstBk);
    agg.win.push(G.state.winner !== undefined ? G.state.round : null);
  } catch (err) {
    agg.exc.push(`partida ${g}: ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
  }
  ['buys', 'auctions', 'auctionNone', 'cards', 'stuck', 'jailPaid', 'jailCardsUsed', 'trades'].forEach((k) => { agg[k] = (agg[k] || 0) + stats[k]; });
}

const pct = (arr, p) => { const a = arr.filter((x) => x !== null).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : '—'; };
const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : '—');
const avgf = (arr, d = 2) => (arr.length ? (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(d) : '—');
const share = (arr) => `${Math.round((100 * arr.filter((x) => x !== null).length) / Math.max(1, arr.length))}%`;

console.log(`\n== ${GAMES} partides | ${JSON.stringify(P)}`);
console.log(`Primera fallida: ${share(agg.first)} de partides | ronda p25 ${pct(agg.first, 0.25)} · mediana ${pct(agg.first, 0.5)} · p75 ${pct(agg.first, 0.75)}`);
console.log(`Guanyador (només en queda 1): ${share(agg.win)} | ronda p25 ${pct(agg.win, 0.25)} · mediana ${pct(agg.win, 0.5)} · p75 ${pct(agg.win, 0.75)}`);
console.log('ronda | efectiu mitjà | patrimoni mitjà | diferència rel. | % comprat | cases | equips vius | en negatiu');
CHECK.forEach((r) => {
  const a = agg.at[r];
  if (!a.money.length) return;
  console.log(`${String(r).padStart(5)} | ${String(avg(a.money)).padStart(13)} | ${String(avg(a.worth)).padStart(15)} | ${String(avgf(a.spread)).padStart(15)} | ${String(Math.round(100 * avgf(a.owned, 3))).padStart(8)}% | ${String(avgf(a.houses, 1)).padStart(5)} | ${String(avgf(a.alive, 1)).padStart(11)} | ${avgf(a.neg, 2)}`);
});
console.log(`Per partida: compres ${(agg.buys / GAMES).toFixed(1)}, subhastes ${(agg.auctions / GAMES).toFixed(1)} (sense comprador ${(agg.auctionNone / GAMES).toFixed(1)}), cartes ${(agg.cards / GAMES).toFixed(1)}, pagar presó ${(agg.jailPaid / GAMES).toFixed(1)}, carta presó ${(agg.jailCardsUsed / GAMES).toFixed(1)}, intercanvis ${(agg.trades / GAMES).toFixed(1)}, encallats ${agg.stuck}`);
console.log(`Errors d'invariants: ${agg.errs.length}${agg.errs.length ? `\n  ${[...new Set(agg.errs)].slice(0, 12).join('\n  ')}` : ''}`);
console.log(`Excepcions: ${agg.exc.length}${agg.exc.length ? `\n  ${[...new Set(agg.exc)].slice(0, 8).join('\n  ')}` : ''}`);
