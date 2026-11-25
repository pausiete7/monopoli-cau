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
  { type: 'go', name: 'Cau de Pios' },
  P('Letrines de campaments', 'marro', 60, [5, 15, 45, 120, 180, 280], 50),
  P('Magatzem de material', 'marro', 60, [10, 30, 90, 235, 360, 505], 50),
  S('Estació Rubí Centre'),
  P('Carrer de Baden Powell', 'cel', 100, [10, 45, 135, 355, 450, 620], 50),
  P('Catacombes de Maristes', 'cel', 120, [10, 60, 150, 395, 505, 675], 50),
  { type: 'jail', name: 'Presó' },
  P('Racó del foc', 'rosa', 140, [15, 75, 225, 595, 705, 845], 100),
  P('Cuina de campaments', 'rosa', 160, [20, 90, 270, 655, 790, 1015], 100),
  S('Aeri de Montserrat'),
  P("Càmping d'avituallament", 'taronja', 180, [25, 105, 300, 725, 845, 1070], 100),
  P("Refugi d'alta muntanya", 'taronja', 200, [25, 120, 330, 790, 900, 1125], 100),
  { type: 'parking', name: 'Pàrquing' },
  P('Parada de la castanyada', 'vermell', 220, [25, 135, 375, 920, 985, 1180], 150),
  P('Castell de Rubí', 'vermell', 240, [30, 150, 450, 985, 1045, 1240], 150),
  S('Estació R1 Ocata'),
  P('Prat de Camprodon', 'groc', 260, [35, 165, 495, 1050, 1100, 1295], 150),
  P('La Carral', 'groc', 280, [40, 180, 540, 1120, 1155, 1350], 150),
  { type: 'gotojail', name: 'Ves a la presó' },
  P('Sala de profes', 'verd', 300, [40, 195, 585, 1180, 1240, 1435], 200),
  P("Cim de la Pica d'Estats", 'verd', 320, [40, 225, 675, 1315, 1350, 1575], 200),
  S('Estació de Sants'),
  P('Canu', 'blau', 350, [55, 265, 750, 1445, 1465, 1690], 200),
  P('Bar Juan', 'blau', 400, [75, 300, 900, 1840, 1915, 2250], 200),
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
//  station (l'equip tria una estació i hi va; si és lliure, la pot comprar)
//  perprop (value per cada propietat que té: + cobra / − paga)
//  goback (value: número de casella; hi va sense cobrar la Sortida)
//  half   (la pròxima tirada només avança la meitat de caselles, arrodonint amunt)
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
  station: 'Anar a una estació (la tria l\'equip)',
  perprop: 'Diners per cada propietat (+ cobra, − paga)',
  goback: 'Tornar a una casella sense cobrar',
  half: 'La pròxima tirada avança la meitat',
  text: 'Només text (ho apliqueu a mà)',
};

// De cada mall: les 5 primeres són d'en Nacho, les 5 següents d'en Pau i les 5 últimes del tercer moni.
export const CARDS = {
  good: [
    { text: "Has guanyat la TEP: la resta d'equips et paguen 50.", effect: 'each', value: 50 },
    { text: "T'ha tocat la Rifa del cau de final de curs. Reps 100.", effect: 'money', value: 100 },
    { text: 'Has sigut estil rànger: aquesta carta et serveix per sortir de la presó.', effect: 'jailfree', value: 0 },
    { text: 'Existeix la T-lleure, així que pots anar a qualsevol estació i comprar-la.', effect: 'station', value: 0 },
    { text: 'Pels teus anys al cau et volen fer un regal: cobreu 30 per cada propietat que tingueu.', effect: 'perprop', value: 30 },
    { text: "T'han escollit portador: tens una tirada extra.", effect: 'extra', value: 0 },
    { text: "Has fet camp a través a l'etapa de la ruta i arribes el primer: avança 3 caselles.", effect: 'move', value: 3 },
    { text: "Abans de l'etapa més dura de la ruta, has fingit que et feia mal el peu i t'han portat amb l'avituallament al càmping del jacuzzi: ves al Cau de Pios i cobra 200.", effect: 'goto', value: 0 },
    { text: "L'extrajob de fer un dinar popular ha sortit molt bé: cobra 200.", effect: 'money', value: 200 },
    { text: "S'ha acabat el cau i heu quedat tots per anar al Juan: ves directament al Bar Juan i, si passes pel Cau de Pios, cobra.", effect: 'goto', value: 23 },
    { text: "T'ofereixes voluntari per fregar les olles dels monitors tots els dies de ruta: tens un torn extra.", effect: 'extra', value: 0 },
    { text: 'Heu fet un 67 amb un turista a Barcelona i us convida a berenar al seu hotel: avança fins a La Carral i, si està lliure, la pots comprar.', effect: 'goto', value: 17 },
    { text: "Has trobat una barra de fuet al fons de la motxilla i la vens a preu d'or a la resta de la unitat: guanyes 150.", effect: 'money', value: 150 },
    { text: "Feu una especialitat boníssima i la resta d'equips us ho reconeixen: cobreu 30 de cada equip.", effect: 'each', value: 30 },
    { text: "Has fet un brownie per vendre'l amb les castanyes i els monitors et recompensen amb un val per sortir de la presó.", effect: 'jailfree', value: 0 },
  ],
  bad: [
    { text: 'Et caus al forat de les letrines: tornes 2 caselles enrere.', effect: 'move', value: -2 },
    { text: "T'enxampen amb el mòbil els monitors a campaments de Nadal: pagues 100.", effect: 'money', value: -100 },
    { text: 'Estaves a un poble de raids i et fan fora: tornes a Letrines de campaments sense cobrar.', effect: 'goback', value: 1 },
    { text: "Se't cau la castanyera plena de castanyes: per les molèsties, pagues 30 als altres equips.", effect: 'each', value: -30 },
    { text: 'Heu guanyat el joc de 14 h, però fent trampes: esteu un torn sense tirar.', effect: 'skip', value: 0 },
    { text: "Estàs de raids, te'n vas al bar i els monis t'enxampen: ves directament a la presó.", effect: 'jail', value: 0 },
    { text: 'Les tendes de pios tornen de campaments plenes de forats: paga 40 per cada casa i 120 per cada hotel.', effect: 'repairs', value: 40 },
    { text: "Has perdut la papallona del fogonet en una excursió i n'has de comprar una altra: paga 50.", effect: 'money', value: -50 },
    { text: "Els monitors s'han perdut a l'etapa de ruta i feu 10 quilòmetres de més: retrocedeix 3 caselles.", effect: 'move', value: -3 },
    { text: 'Tens la tenda superdesordenada: paga 20 per cada propietat.', effect: 'perprop', value: -20 },
    { text: "Se't trenquen les botes el primer dia de ruta: perds un torn.", effect: 'skip', value: 0 },
    { text: "Se't crema el sopar en una sortida: pagues 20 a cada equip per compensar-ho.", effect: 'each', value: -20 },
    { text: "Et toca portar la farmaciola una estona: a la pròxima tirada avances la meitat de caselles.", effect: 'half', value: 0 },
    { text: 'Ha plogut i la teva llibreta de raids està xopa: pagues 100 per comprar-ne una de nova.', effect: 'money', value: -100 },
    { text: "Et pillen saltant-te els serveis al campament: ves directament a la presó.", effect: 'jail', value: 0 },
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
