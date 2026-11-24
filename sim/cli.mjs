// Jugar al Caupoli des de la consola, amb el motor real (per a proves).
// L'estat es desa en un fitxer, així cada ordre continua la partida.
// Ús: node sim/cli.mjs <ordre> [arguments]     (fitxer: variable CAUPOLI_FILE, per defecte sim/.cli-state.json)
// Ordres: help | new [diners] | rules clau=valor ... | state | board | log [n]
//   roll N | buy | auction | skip | bid EQUIP PREU | card | end
//   build CASELLA | sell CASELLA | mortgage CASELLA
//   money EQUIP QUANTITAT [EQUIP_DESTÍ] | trade A B propsA propsB dinersA dinersB (props separades per comes o -)
//   owner CASELLA EQUIP|bank | place EQUIP CASELLA [land] | jail EQUIP | payjail | jailcard | jailcards EQUIP N
//   minigame 0:2,1:1,2:-1,3:-2 | draw EQUIP good|bad | bankrupt EQUIP | revive EQUIP | undo
import fs from 'fs';

const file = process.env.CAUPOLI_FILE || new URL('./.cli-state.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const store = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const G = await import('../js/engine.js');

const [cmd = 'state', ...a] = process.argv.slice(2);
const num = (x) => Number(x);
const list = (x) => (!x || x === '-' ? [] : String(x).split(',').map(Number));
let result = null;
let mutate = true;

if (cmd !== 'new') G.load();

const C = {
  help: () => { mutate = false; result = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n'); },
  new: () => {
    G.newGame(G.defaultConfig(), undefined);
    G.startGame({ teams: G.state.teams.map((t) => ({ name: t.name, color: t.color })), rules: a[0] ? { startMoney: num(a[0]) } : {} });
  },
  rules: () => { G.updateConfig((st) => a.forEach((kv) => { const [k, v] = kv.split('='); st.config.rules[k] = v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v); })); },
  state: () => { mutate = false; },
  board: () => {
    mutate = false;
    result = G.state.config.board.map((s, i) => {
      const o = G.state.owners[i];
      const extra = o ? ` | amo ${o.team} (${G.team(o.team).name}) cases ${o.houses}${o.mortgaged ? ' HIPOTECADA' : ''} lloguer ${G.rentFor(i)}` : '';
      return `${i}. ${s.type} ${s.name}${s.price ? ` preu ${s.price}` : ''}${s.house ? ` casa ${s.house}` : ''}${s.rent ? ` lloguers ${s.rent.join('/')}` : ''}${s.amount ? ` paga ${s.amount}` : ''}${extra}`;
    }).join('\n');
  },
  log: () => { mutate = false; result = G.state.log.slice(0, num(a[0] || 15)).map((l) => `- [${l.kind}] ${l.text}`).reverse().join('\n'); },
  roll: () => G.roll(num(a[0])),
  buy: () => { const q = G.state.queue[0]; result = q?.type === 'buy' ? G.buy(q.sq, q.team) : 'No hi ha cap compra pendent.'; },
  auction: () => { const q = G.state.queue[0]; result = q?.type === 'buy' ? G.startAuction(q.sq) : G.startAuction(num(a[0])); },
  skip: () => { result = G.state.queue.length ? G.dismissQueueItem() : 'No hi ha res pendent.'; },
  bid: () => { const q = G.state.queue[0]; result = q?.type === 'auction' ? G.auctionWin(q.sq, num(a[0]), num(a[1])) : 'No hi ha cap subhasta pendent.'; },
  card: () => { result = G.state.queue[0]?.type === 'card' ? G.applyCard() : 'No hi ha cap carta pendent.'; },
  end: () => { result = G.endTurn(); },
  build: () => { result = G.build(num(a[0])); },
  sell: () => { result = G.sellHouse(num(a[0])); },
  mortgage: () => { result = G.toggleMortgage(num(a[0])); },
  money: () => { result = G.adjust(num(a[0]), num(a[1]), a[3] || 'cli', a[2] !== undefined && a[2] !== '-' ? num(a[2]) : null); },
  trade: () => { result = G.trade({ a: num(a[0]), b: num(a[1]), aProps: list(a[2]), bProps: list(a[3]), aMoney: num(a[4] || 0), bMoney: num(a[5] || 0) }); },
  owner: () => { result = G.setOwner(num(a[0]), a[1] === 'bank' ? null : num(a[1])); },
  place: () => { result = G.placeTeam(num(a[0]), num(a[1]), a[2] === 'land'); },
  jail: () => G.toggleJail(num(a[0])),
  payjail: () => G.payJail(),
  jailcard: () => G.useJailCard(),
  jailcards: () => G.setJailCards(num(a[0]), num(a[1])),
  minigame: () => {
    const dist = {};
    String(a[0] || '').split(',').filter(Boolean).forEach((p) => { const [k, v] = p.split(':').map(Number); dist[k] = v; });
    G.minigame(dist, 'cli');
  },
  draw: () => G.drawCard(num(a[0]), a[1] === 'bad' ? 'bad' : 'good'),
  bankrupt: () => G.bankrupt(num(a[0])),
  revive: () => G.revive(num(a[0])),
  undo: () => { result = G.undo() ? 'Desfet.' : 'No hi ha res per desfer.'; },
};

if (!C[cmd]) { console.log(`Ordre desconeguda: ${cmd}. Proveu «help».`); process.exit(1); }
try {
  C[cmd]();
  if (mutate && cmd !== 'undo') G.checkBankrupt(); // com fa la web després de cada acció
} catch (err) {
  console.log(`EXCEPCIÓ: ${err.stack}`);
}
G.fx.length = 0;
fs.writeFileSync(file, JSON.stringify(store));

const st = G.state;
if (result) console.log(`>> ${result}`);
if (['help', 'board', 'log'].includes(cmd)) process.exit(0);
const sqName = (i) => `${i}:${st.config.board[i].name}`;
console.log(`Ronda ${st.round} | torn de ${st.turn} (${G.current().name}) | fase ${st.phase} | última tirada ${st.lastRoll ?? '-'}${st.winner !== undefined ? ` | GUANYADOR ${st.winner}` : ''}`);
console.log(`Pendent: ${st.queue.length ? st.queue.map((q) => (q.type === 'card' ? `carta ${q.deck} per a ${q.team}: «${G.cardOf(q)?.text}» [${G.cardOf(q)?.effect} ${G.cardOf(q)?.value}]` : `${q.type} ${sqName(q.sq)}${q.team !== undefined ? ` (equip ${q.team})` : ''}`)).join(' ; ') : 'res'}`);
st.teams.forEach((t, k) => {
  const props = G.propsOf(k).map((i) => `${i}${st.owners[i].houses ? `+${st.owners[i].houses}c` : ''}${st.owners[i].mortgaged ? 'H' : ''}`).join(',');
  console.log(`  ${k} ${t.name}: ${t.money} | ${sqName(t.pos)}${t.jail ? ` | PRESÓ (torns ${t.jailTurns})` : ''}${t.jailCards ? ` | cartes presó ${t.jailCards}` : ''}${t.skip ? ` | perd ${t.skip}` : ''}${t.extra ? ` | extra ${t.extra}` : ''}${t.bankrupt ? ' | FALLIDA' : ''} | props [${props}]`);
});
console.log('Últims moviments:');
st.log.slice(0, 5).reverse().forEach((l) => console.log(`  - ${l.text}`));
