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

// Economia: preus i cost de les cases del Monopoly clàssic. Els lloguers són els clàssics ×1,5
// (sense cases i amb 1-2 cases) i una mica menys amb 3-4 cases i hotel. Amb ×2 el primer equip queia\n// cap a la ronda 9 i es passava mitja sessió mirant, perquè amb un sol dau i
// 24 caselles la partida avanci prou per fer-la en 1 h 30 - 2 h (vegeu sim/economy.mjs).
const P = (name, group, price, rent, house) => ({ type: 'prop', name, group, price, rent, house });
const S = (name) => ({ type: 'station', name, price: 200 });

// 24 caselles: 16 propietats, 4 estacions i 4 cantonades.
// Cada costat és d'un moni: 4 propietats i 1 estació.
// La 0 és la Sortida (cantonada de baix a la dreta) i es va en sentit horari.
export const BOARD = [
  { type: 'go', name: 'Sortida' },
  P('Lavabos del cau', 'marro', 60, [5, 15, 45, 120, 180, 280], 50),
  P('Magatzem de material', 'marro', 60, [10, 30, 90, 235, 360, 505], 50),
  S('Estació FGC Rubí'),
  P('Pati del cau', 'cel', 100, [10, 45, 135, 355, 450, 620], 50),
  P('Local de Pioners', 'cel', 120, [10, 60, 150, 395, 505, 675], 50),
  { type: 'jail', name: 'Presó' },
  P('Racó del foc', 'rosa', 140, [15, 75, 225, 595, 705, 845], 100),
  P('Cuina de campaments', 'rosa', 160, [20, 90, 270, 655, 790, 1015], 100),
  S('Estació Renfe Rubí'),
  P('Riera de Rubí', 'taronja', 180, [25, 105, 300, 725, 845, 1070], 100),
  P("Parc de Ca n'Oriol", 'taronja', 200, [25, 120, 330, 790, 900, 1125], 100),
  { type: 'parking', name: 'Pàrquing' },
  P('Castell de Rubí', 'vermell', 220, [25, 135, 375, 920, 985, 1180], 150),
  P('Plaça del Doctor Guardiet', 'vermell', 240, [30, 150, 450, 985, 1045, 1240], 150),
  S('Cremallera de Núria'),
  P('Montserrat', 'groc', 260, [35, 165, 495, 1050, 1100, 1295], 150),
  P('Sant Llorenç del Munt', 'groc', 280, [40, 180, 540, 1120, 1155, 1350], 150),
  { type: 'gotojail', name: 'Ves a la presó' },
  P("Campaments d'estiu", 'verd', 300, [40, 195, 585, 1180, 1240, 1435], 200),
  P('Ruta de Pioners', 'verd', 320, [40, 225, 675, 1315, 1350, 1575], 200),
  S('Estació de Sants'),
  P('Vall de Núria', 'blau', 350, [55, 265, 750, 1445, 1465, 1690], 200),
  P('Puigmal', 'blau', 400, [75, 300, 900, 1840, 1915, 2250], 200),
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

// Fitxes 3D que pot triar cada equip
export const TOKENS = {
  tenda: 'Tenda',
  foguera: 'Foguera',
  fogonet: 'Fogonet',
  cantimplora: 'Cantimplora',
  bota: 'Bota de muntanya',
  fular: 'Fular',
  frontal: 'Frontal',
  peo: 'Peó',
};

export const TEAMS = [
  { id: 't1', name: 'Equip Foc', color: '#E4572E', token: 'foguera' },
  { id: 't2', name: 'Equip Aigua', color: '#2D7FF9', token: 'cantimplora' },
  { id: 't3', name: 'Equip Terra', color: '#2E9E5B', token: 'tenda' },
  { id: 't4', name: 'Equip Vent', color: '#9B5DE5', token: 'fular' },
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
  stationRent: [30, 60, 120, 200],
  parkingPot: true, // les multes (cartes, reparacions, sortir de la presó) van al pot del Pàrquing
  potStart: 0, // diners amb què comença el pot a cada partida
  mgWheel: true, // «Minijoc» obre la ruleta; si no, va directe a repartir cartes
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
