// Contingut per defecte del Caupoli.
// Tot això es pot canviar des de Configuració dins de la mateixa web.

export const GROUPS = {
  marro:   { name: 'Marró',   color: '#7A4A2A' },
  cel:     { name: 'Cel',     color: '#6EC1E4' },
  rosa:    { name: 'Rosa',    color: '#D6408B' },
  taronja: { name: 'Taronja', color: '#F08A24' },
  vermell: { name: 'Vermell', color: '#D7263D' },
  groc:    { name: 'Groc',    color: '#F2C31B' },
  verd:    { name: 'Verd',    color: '#1F9D55' },
  blau:    { name: 'Blau',    color: '#1D4ED8' },
};

const P = (name, group, price, rent, house) => ({ type: 'prop', name, group, price, rent, house });
const S = (name) => ({ type: 'station', name, price: 200 });

// 24 caselles: 16 propietats, 4 estacions i 4 cantonades.
// Cada costat és d'un moni: 4 propietats i 1 estació.
// La 0 és la Sortida (cantonada de baix a la dreta) i es va en sentit horari.
export const BOARD = [
  { type: 'go', name: 'Sortida' },
  P('Lavabos del cau', 'marro', 60, [2, 10, 30, 90, 160, 250], 50),
  P('Magatzem de material', 'marro', 60, [4, 20, 60, 180, 320, 450], 50),
  S('Estació FGC Rubí'),
  P('Pati del cau', 'cel', 100, [6, 30, 90, 270, 400, 550], 50),
  P('Local de Pioners', 'cel', 120, [8, 40, 100, 300, 450, 600], 50),
  { type: 'jail', name: 'Presó' },
  P('Racó del foc', 'rosa', 140, [10, 50, 150, 450, 625, 750], 100),
  P('Cuina de campaments', 'rosa', 160, [12, 60, 180, 500, 700, 900], 100),
  S('Estació Renfe Rubí'),
  P('Riera de Rubí', 'taronja', 180, [14, 70, 200, 550, 750, 950], 100),
  P("Parc de Ca n'Oriol", 'taronja', 200, [16, 80, 220, 600, 800, 1000], 100),
  { type: 'tax', name: 'Multa', amount: 100 },
  P('Castell de Rubí', 'vermell', 220, [18, 90, 250, 700, 875, 1050], 150),
  P('Plaça del Doctor Guardiet', 'vermell', 240, [20, 100, 300, 750, 925, 1100], 150),
  S('Cremallera de Núria'),
  P('Montserrat', 'groc', 260, [22, 110, 330, 800, 975, 1150], 150),
  P('Sant Llorenç del Munt', 'groc', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { type: 'gotojail', name: 'Ves a la presó' },
  P("Campaments d'estiu", 'verd', 300, [26, 130, 390, 900, 1100, 1275], 200),
  P('Ruta de Pioners', 'verd', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  S('Estació de Sants'),
  P('Vall de Núria', 'blau', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  P('Puigmal', 'blau', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

// Efectes possibles d'una carta:
//  money  (value: + cobra / − paga al banc)
//  each   (value: + cobra de cada equip / − paga a cada equip)
//  goto   (value: número de casella; si passa per la Sortida, cobra)
//  move   (value: caselles endavant o, si és negatiu, endarrere)
//  jail   (va a la presó)
//  jailfree (carta per sortir de la presó)
//  repairs  (value: preu per casa; l'hotel paga value × 3)
//  skip   (perd el pròxim torn)
//  extra  (tirada extra)
//  text   (no fa res sola: ho apliqueu vosaltres)
export const EFFECTS = {
  money: 'Diners (+ cobra, − paga)',
  each: 'Amb cada equip (+ cobra, − paga)',
  goto: 'Anar a una casella',
  move: 'Moure caselles (+/−)',
  jail: 'Anar a la presó',
  jailfree: 'Surt de la presó (es guarda)',
  repairs: 'Reparacions (per casa)',
  skip: 'Perd el pròxim torn',
  extra: 'Tirada extra',
  text: 'Només text (ho apliqueu a mà)',
};

export const CARDS = {
  good: [
    { text: 'Has muntat la tenda en tres minuts. Cobra 150.', effect: 'money', value: 150 },
    { text: 'Has trobat el foulard que havies perdut. Cobra 100.', effect: 'money', value: 100 },
    { text: 'Ets el primer de la cua del sopar. Avança fins a la Sortida.', effect: 'goto', value: 0 },
    { text: 'La teva cançó de campaments ha triomfat: cada equip et paga 30.', effect: 'each', value: 30 },
    { text: 'Quedes lliure de la presó! Guarda aquesta carta i fes-la servir quan et tanquin.', effect: 'jailfree', value: 0 },
    { text: 'Tens el vent a favor. Avança 3 caselles.', effect: 'move', value: 3 },
    { text: 'Tira un altre cop.', effect: 'extra', value: 0 },
    { text: "Has venut totes les neules de l'extrajob. Cobra 200.", effect: 'money', value: 200 },
    { text: 'El kraal t\'ha vist amb camisa i foulard. Cobra 120.', effect: 'money', value: 120 },
    { text: 'Agafes el cremallera sense fer cua. Ves a la Cremallera de Núria.', effect: 'goto', value: 15 },
  ],
  bad: [
    { text: "T'has deixat el sac de dormir a casa. Paga 100.", effect: 'money', value: -100 },
    { text: 'Has parlat en castellà davant del kraal. Paga 50.', effect: 'money', value: -50 },
    { text: 'Ves directament a la presó.', effect: 'jail', value: 0 },
    { text: 'Has trencat un fogonet. Paga 150.', effect: 'money', value: -150 },
    { text: "T'has menjat les llaminadures dels altres: paga 25 a cada equip.", effect: 'each', value: -25 },
    { text: 'Toca arreglar les cabanes: paga 40 per cada casa (i 120 per hotel).', effect: 'repairs', value: 40 },
    { text: 'Has girat malament al camí. Retrocedeix 3 caselles.', effect: 'move', value: -3 },
    { text: "T'has adormit. Perds el pròxim torn.", effect: 'skip', value: 0 },
    { text: "T'has perdut a l'excursió per anar mirant el mòbil. Paga 80.", effect: 'money', value: -80 },
    { text: 'Has arribat tard a la reunió. Paga 60.', effect: 'money', value: -60 },
  ],
};

export const TEAMS = [
  { id: 't1', name: 'Equip Foc', color: '#E4572E' },
  { id: 't2', name: 'Equip Aigua', color: '#2D7FF9' },
  { id: 't3', name: 'Equip Terra', color: '#2E9E5B' },
  { id: 't4', name: 'Equip Vent', color: '#9B5DE5' },
];

export const RULES = {
  startMoney: 1500,
  goSalary: 200,
  jailFine: 50,
  jailExitRoll: 6,
  jailPay: true, // es pot pagar per sortir
  jailRoll: true, // es pot sortir traient el número
  jailMaxTurns: 3, // torns màxims a la presó
  maxDie: 6,
  stationRent: [25, 50, 100, 200],
  parkingPot: false,
  currency: '€',
  tilt: true,
  chanceDeck: 'mix', // mix | good | bad
  goodName: 'Bona Acció',
  badName: 'Mal Rotllet',
};

export const deckName = (rules, d) => (d === 'good' ? rules.goodName || 'Bona Acció' : rules.badName || 'Mal Rotllet');

export const MINIGAMES = [
  'Endreçar ampolles',
  'Cata de sucs',
  'Macro jungle speed',
  'Botes de ping-pong',
  'Castell de gots',
  'Dit musical TikTok',
  'Galeta i taral·lejar',
];
