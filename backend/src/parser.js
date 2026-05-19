export function normalize(text) {
  return String(text || '')
  .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function parseBlock(block, text) {
  if (block === 'vehicle') return parseVehicle(text);
  if (block === 'mechanics') return parseMechanics(text);
  if (block === 'body') return parseLines(text, 6);
  if (block === 'cell') return parseLines(text, 14);
  throw new Error('Bloc inconnu');
}

function parseDate(text) {
  const n = normalize(text);
  const date = n.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (date) {
    let [, d, m, y] = date;
    if (y.length === 2) y = `20${y}`;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  const months = {
    janvier: '01', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
    juillet: '07', aout: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12'
  };
  for (const [month, value] of Object.entries(months)) {
    if (n.includes(month)) {
      const year = n.match(/(19|20)\d{2}/)?.[0];
      if (year) return `01/${value}/${year}`;
    }
  }
  const year = n.match(/(19|20)\d{2}/)?.[0];
  return year ? `01/01/${year}` : '';
}

// ─── MARQUES ────────────────────────────────────────────────────────────────
const BRANDS = {
  pilote: 'Pilote',
  challenger: 'Challenger',
  chausson: 'Chausson',
  autostar: 'Autostar',
  rapido: 'Rapido',
  fleurette: 'Fleurette',
  florette: 'Fleurette',
  flourette: 'Fleurette',
  itineo: 'Itinéo',
  itineao: 'Itinéo',
  'campereve': 'Campéréve',
  camperave: 'Campéréve',
  esterel: 'Esterel',
  'le voyageur': 'Le Voyageur',
  'font vendome': 'Font Vendôme',
  mclouis: 'McLouis',
  'mc louis': 'McLouis',
  trigano: 'Trigano',
  iticar: 'Iticar',
  dreamer: 'Dreamer',
  malibu: 'Malibu',
  crosscamp: 'Crosscamp',
  hymer: 'Hymer',
  irmer: 'Hymer',
  haimer: 'Hymer',
  burstner: 'Bürstner',
  buerstner: 'Bürstner',
  dethleffs: 'Dethleffs',
  carado: 'Carado',
  sunlight: 'Sunlight',
  niesmann: 'Niesmann+Bischoff',
  'eura mobil': 'Eura Mobil',
  euramobil: 'Eura Mobil',
  concorde: 'Concorde',
  frankia: 'Frankia',
  morelo: 'Morelo',
  globecar: 'Globecar',
  'karmann mobil': 'Karmann Mobil',
  karmann: 'Karmann Mobil',
  knaus: 'Knaus',
  tabbert: 'Tabbert',
  weinsberg: 'Weinsberg',
  hobby: 'Hobby',
  fendt: 'Fendt',
  lmc: 'LMC',
  tec: 'TEC',
  forster: 'Forster',
  eriba: 'Eriba',
  laika: 'Laika',
  rimor: 'Rimor',
  elnagh: 'Elnagh',
  wingamm: 'Wingamm',
  possl: 'Pössl',
  poessl: 'Pössl',
  mobilvetta: 'Mobilvetta Design',
  adria: 'Adria',
  benimar: 'Benimar',
  bavaria: 'Bavaria',
  swift: 'Swift',
  bailey: 'Bailey',
  autotrail: 'Auto-Trail',
  elddis: 'Elddis',
  'roller team': 'Roller Team',
  rollerteam: 'Roller Team',
  carthago: 'Carthago',
  kartago: 'Carthago',
  jayco: 'Jayco',
  blucamp: 'Blucamp',
  spacecamper: 'Spacecamper',
  westfalia: 'Westfalia',
  clever: 'Clever',
  lindner: 'Lindner',
  nobile: 'Nobile',
  roadcar: 'Roadcar',
  capron: 'Capron',
  'van tourer': 'Van Tourer',
  zefiro: 'Zefiro',
  ahorn: 'Ahorn',
  iridium: 'Iridium',
};

// ─── MOTORISATIONS ──────────────────────────────────────────────────────────
const ENGINES = [
  // Fiat Ducato
  { keys: ['ducato', '2.8', '127'], label: 'Fiat Ducato 2.8L 127ch' },
  { keys: ['ducato', '2.8', '146'], label: 'Fiat Ducato 2.8L 146ch' },
  { keys: ['ducato', '2.3', '120'], label: 'Fiat Ducato 2.3L 120ch' },
  { keys: ['ducato', '2.3', '130'], label: 'Fiat Ducato 2.3L 130ch' },
  { keys: ['ducato', '2.3', '140'], label: 'Fiat Ducato 2.3L 140ch' },
  { keys: ['ducato', '2.3', '150'], label: 'Fiat Ducato 2.3L 150ch' },
  { keys: ['ducato', '2.3', '160'], label: 'Fiat Ducato 2.3L 160ch' },
  { keys: ['ducato', '2.3', '180'], label: 'Fiat Ducato 2.3L 180ch' },
  { keys: ['ducato', '2.2', '140'], label: 'Fiat Ducato 2.2L 140ch' },
  { keys: ['ducato', '2.2', '160'], label: 'Fiat Ducato 2.2L 160ch' },
  { keys: ['ducato', '2.2', '180'], label: 'Fiat Ducato 2.2L 180ch' },
  // Citroën Jumper
  { keys: ['jumper', '2.2', '120'], label: 'Citroën Jumper 2.2L 120ch' },
  { keys: ['jumper', '2.2', '140'], label: 'Citroën Jumper 2.2L 140ch' },
  { keys: ['jumper', '2.2', '165'], label: 'Citroën Jumper 2.2L 165ch' },
  // Peugeot Boxer
  { keys: ['boxer', '2.2', '120'], label: 'Peugeot Boxer 2.2L 120ch' },
  { keys: ['boxer', '2.2', '140'], label: 'Peugeot Boxer 2.2L 140ch' },
  { keys: ['boxer', '2.2', '165'], label: 'Peugeot Boxer 2.2L 165ch' },
  // Ford Transit Custom
  { keys: ['transit custom', '2.0', '105'], label: 'Ford Transit Custom 2.0L 105ch' },
  { keys: ['transit custom', '2.0', '130'], label: 'Ford Transit Custom 2.0L 130ch' },
  { keys: ['transit custom', '2.0', '170'], label: 'Ford Transit Custom 2.0L 170ch' },
  // Ford Transit
  { keys: ['transit', '2.2', '100'], label: 'Ford Transit 2.2L 100ch' },
  { keys: ['transit', '2.2', '125'], label: 'Ford Transit 2.2L 125ch' },
  { keys: ['transit', '2.2', '140'], label: 'Ford Transit 2.2L 140ch' },
  { keys: ['transit', '2.2', '155'], label: 'Ford Transit 2.2L 155ch' },
  { keys: ['transit', '2.0', '130'], label: 'Ford Transit 2.0L 130ch' },
  { keys: ['transit', '2.0', '150'], label: 'Ford Transit 2.0L 150ch' },
  { keys: ['transit', '2.0', '170'], label: 'Ford Transit 2.0L 170ch' },
  // Renault Master
  { keys: ['master', '2.3', '110'], label: 'Renault Master 2.3L 110ch' },
  { keys: ['master', '2.3', '125'], label: 'Renault Master 2.3L 125ch' },
  { keys: ['master', '2.3', '145'], label: 'Renault Master 2.3L 145ch' },
  { keys: ['master', '2.3', '163'], label: 'Renault Master 2.3L 163ch' },
  { keys: ['master', '2.3', '180'], label: 'Renault Master 2.3L 180ch' },
  // Renault Talento
  { keys: ['talento', '1.6', '125'], label: 'Renault Talento 1.6L 125ch' },
  { keys: ['talento', '1.6', '145'], label: 'Renault Talento 1.6L 145ch' },
  // Mercedes Sprinter
  { keys: ['sprinter', '2.2', '114'], label: 'Mercedes Sprinter 2.2L 114ch' },
  { keys: ['sprinter', '2.2', '143'], label: 'Mercedes Sprinter 2.2L 143ch' },
  { keys: ['sprinter', '2.2', '163'], label: 'Mercedes Sprinter 2.2L 163ch' },
  { keys: ['sprinter', '2.2', '177'], label: 'Mercedes Sprinter 2.2L 177ch' },
  { keys: ['sprinter', '3.0', '190'], label: 'Mercedes Sprinter 3.0L 190ch' },
  { keys: ['sprinter', '3.0', '211'], label: 'Mercedes Sprinter 3.0L 211ch' },
  { keys: ['sprinter', '3.0', '224'], label: 'Mercedes Sprinter 3.0L 224ch' },
  { keys: ['sprinter', '2.0', '114'], label: 'Mercedes Sprinter 2.0L 114ch' },
  { keys: ['sprinter', '2.0', '143'], label: 'Mercedes Sprinter 2.0L 143ch' },
  { keys: ['sprinter', '2.0', '170'], label: 'Mercedes Sprinter 2.0L 170ch' },
  // Mercedes Classe V
  { keys: ['classe v', '2.2', '136'], label: 'Mercedes Classe V 2.2L 136ch' },
  { keys: ['classe v', '2.2', '163'], label: 'Mercedes Classe V 2.2L 163ch' },
  { keys: ['classe v', '3.0', '190'], label: 'Mercedes Classe V 3.0L 190ch' },
  // Volkswagen Crafter
  { keys: ['crafter', '2.0', '102'], label: 'Volkswagen Crafter 2.0L 102ch' },
  { keys: ['crafter', '2.0', '122'], label: 'Volkswagen Crafter 2.0L 122ch' },
  { keys: ['crafter', '2.0', '140'], label: 'Volkswagen Crafter 2.0L 140ch' },
  { keys: ['crafter', '2.0', '163'], label: 'Volkswagen Crafter 2.0L 163ch' },
  { keys: ['crafter', '2.0', '177'], label: 'Volkswagen Crafter 2.0L 177ch' },
  // VW Transporter T6
  { keys: ['transporter', '2.0', '84'], label: 'Volkswagen Transporter T6 2.0L 84ch' },
  { keys: ['transporter', '2.0', '102'], label: 'Volkswagen Transporter T6 2.0L 102ch' },
  { keys: ['transporter', '2.0', '150'], label: 'Volkswagen Transporter T6 2.0L 150ch' },
  { keys: ['transporter', '2.0', '204'], label: 'Volkswagen Transporter T6 2.0L 204ch' },
  // Iveco Daily
  { keys: ['iveco', '3.0', '180'], label: 'Iveco Daily 3.0L 180ch' },
  { keys: ['iveco', '3.0', '205'], label: 'Iveco Daily 3.0L 205ch' },
  { keys: ['iveco', '3.0', '210'], label: 'Iveco Daily 3.0L 210ch' },
  { keys: ['iveco', '2.3', '116'], label: 'Iveco Daily 2.3L 116ch' },
  { keys: ['iveco', '2.3', '136'], label: 'Iveco Daily 2.3L 136ch' },
  { keys: ['daily', '3.0', '180'], label: 'Iveco Daily 3.0L 180ch' },
  { keys: ['daily', '3.0', '205'], label: 'Iveco Daily 3.0L 205ch' },
  { keys: ['daily', '3.0', '210'], label: 'Iveco Daily 3.0L 210ch' },
  { keys: ['daily', '2.3', '116'], label: 'Iveco Daily 2.3L 116ch' },
  { keys: ['daily', '2.3', '136'], label: 'Iveco Daily 2.3L 136ch' },
  // MAN TGE
  { keys: ['tge', '2.0', '102'], label: 'MAN TGE 2.0L 102ch' },
  { keys: ['tge', '2.0', '140'], label: 'MAN TGE 2.0L 140ch' },
  { keys: ['tge', '2.0', '177'], label: 'MAN TGE 2.0L 177ch' },
  { keys: ['man tge', '2.0', '102'], label: 'MAN TGE 2.0L 102ch' },
  { keys: ['man tge', '2.0', '140'], label: 'MAN TGE 2.0L 140ch' },
  { keys: ['man tge', '2.0', '177'], label: 'MAN TGE 2.0L 177ch' },
  // Toyota Proace
  { keys: ['proace', '2.0', '122'], label: 'Toyota Proace 2.0L 122ch' },
  { keys: ['proace', '2.0', '145'], label: 'Toyota Proace 2.0L 145ch' },
];

const BASE_VEHICLES = [
  { keys: ['ducato'], label: 'Fiat Ducato' },
  { keys: ['jumper'], label: 'Citroën Jumper' },
  { keys: ['boxer'], label: 'Peugeot Boxer' },
  { keys: ['transit custom'], label: 'Ford Transit Custom' },
  { keys: ['transit'], label: 'Ford Transit' },
  { keys: ['master'], label: 'Renault Master' },
  { keys: ['talento'], label: 'Renault Talento' },
  { keys: ['sprinter'], label: 'Mercedes Sprinter' },
  { keys: ['classe v'], label: 'Mercedes Classe V' },
  { keys: ['crafter'], label: 'Volkswagen Crafter' },
  { keys: ['transporter'], label: 'Volkswagen Transporter T6' },
  { keys: ['iveco'], label: 'Iveco Daily' },
  { keys: ['daily'], label: 'Iveco Daily' },
  { keys: ['man tge'], label: 'MAN TGE' },
  { keys: ['tge'], label: 'MAN TGE' },
  { keys: ['proace'], label: 'Toyota Proace' },
];

function parseMotorisation(n) {
  const norm = n.replace(/,/g, '.');

  // Match précis porteur + cylindrée + puissance
  for (const engine of ENGINES) {
    if (engine.keys.every(k => norm.includes(k))) {
      return engine.label;
    }
  }

  // Match partiel : porteur + ce qui est disponible
  const cylinder = norm.match(/(1\.6|2\.0|2\.2|2\.3|2\.8|3\.0)/)?.[0];
  const hp = norm.match(/(\d{2,3})\s*(ch|chevaux)/)?.[1];
  const auto = norm.includes('automatique') || norm.includes('bva') || norm.includes('boite auto') ? ' BVA' : '';

  for (const base of BASE_VEHICLES) {
    if (base.keys.every(k => norm.includes(k))) {
      const parts = [base.label, cylinder ? `${cylinder}L` : '', hp ? `${hp}ch` : ''].filter(Boolean);
      return parts.join(' ') + auto;
    }
  }

  // Fallback cylindrée + puissance seules
  if (cylinder || hp) {
    return [cylinder ? `${cylinder}L` : '', hp ? `${hp}ch` : ''].filter(Boolean).join(' ') + auto;
  }

  return '';
}

function normalizeModelText(text) {
  // Convertit les nombres en lettres dans les noms de modèles
  const n = normalize(text);
  return n
    .replace(/soixante quatorze/g, '74')
    .replace(/soixante quinze/g, '75')
    .replace(/soixante seize/g, '76')
    .replace(/soixante dix sept/g, '77')
    .replace(/soixante dix huit/g, '78')
    .replace(/soixante dix neuf/g, '79')
    .replace(/soixante dix/g, '70')
    .replace(/soixante onze/g, '71')
    .replace(/soixante douze/g, '72')
    .replace(/soixante treize/g, '73')
    .replace(/quatre vingt dix neuf/g, '99')
    .replace(/quatre vingt dix huit/g, '98')
    .replace(/quatre vingt dix sept/g, '97')
    .replace(/quatre vingt dix six/g, '96')
    .replace(/quatre vingt quinze/g, '95')
    .replace(/quatre vingt quatorze/g, '94')
    .replace(/quatre vingt treize/g, '93')
    .replace(/quatre vingt douze/g, '92')
    .replace(/quatre vingt onze/g, '91')
    .replace(/quatre vingt dix/g, '90')
    .replace(/quatre vingt/g, '80')
    .replace(/cinquante/g, '50')
    .replace(/quarante/g, '40')
    .replace(/trente/g, '30')
    .replace(/vingt/g, '20')
    .replace(/cent/g, '100')
    .replace(/neuf/g, '9')
    .replace(/huit/g, '8')
    .replace(/sept/g, '7')
    .replace(/six/g, '6')
    .replace(/cinq/g, '5')
    .replace(/quatre/g, '4')
    .replace(/trois/g, '3')
    .replace(/deux/g, '2')
    .replace(/un/g, '1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVehicle(text) {
  const n = normalize(text);

  const marque = Object.entries(BRANDS).find(([key]) => n.includes(key))?.[1] || '';

  const models = [
    'Compact Select DC', 'Compact SP', 'Compact SC', 'Compact DL', 'Compact Plus',
    'Cap Life', 'Cap Liberté',
    'Twin 600 SP', 'Twin 640 SGX', 'Twin 600', 'Twin 640',
    'Flash 718 XLB', 'Flash 738 XLB', 'Flash 628 EB',
    'Welcome 718 XLB', 'Welcome 738 XLB',
    '388 EB', '394 FA', '711 XLB', '718 XLB', '738 XLB', '728 XLB',
    'V594', 'V697', 'V636', 'V674',
    'Tramp 598', 'Tramp 620', 'Tramp 640',
    'Pacific P696D', 'Pacific P740D',
    'Galaxy G740', 'Galaxy G694',
    'Kronos 265 TL', 'Kronos 285 TL',
    'Prestige 694', 'Prestige 740',
    'Integral 920', 'Integral 880',
    'Magister 74 LMF', 'Magister 74', 'Magister 64', 'Magister 54',
    'Florium', 'Wincester', 'Microsommeil',
  ];
  const nModel = normalizeModelText(text);
  const modele = models.find((m) => {
    const nm = normalize(m).replace(/\s+/g, '');
    const nTest = nModel.replace(/\s+/g, '');
    if (nTest.includes(nm)) return true;
    // Match souple : chaque mot du modèle présent dans le texte normalisé
    const words = normalize(m).split(' ').filter(w => w.length > 1);
    return words.length >= 2 && words.every(w => nModel.includes(w));
  }) || '';

  const motorisation = parseMotorisation(n);

  const rawPlate = String(text).toUpperCase().replace(/[\s-]/g, '').match(/[A-Z]{2}\d{3}[A-Z]{2}/)?.[0] || '';
  const immat = rawPlate ? `${rawPlate.slice(0, 2)}-${rawPlate.slice(2, 5)}-${rawPlate.slice(5)}` : '';

  const prixAchat = n.match(/(?:achete|achete|achat|prix)\D{0,25}(\d[\d\s.]{2,})/)?.[1]?.replace(/\D/g, '') || '';

  const cessionOdoo = n.includes('pas de cession') || n.includes('sans cession') || n.includes('pas d odoo')
    ? '0'
    : n.match(/(?:cession|session|odoo|doux)\D{0,25}(\d[\d\s.]{1,})/)?.[1]?.replace(/\D/g, '') || '';

  const sales = {
    thibault: 'Thibault', rager: 'Thibault',
    nadia: 'Nadia', faramin: 'Nadia',
    gerald: 'Gérald', dd: 'Gérald',
    malo: 'Malo', simon: 'Simon',
    ragot: 'Kevin R.', guesdon: 'Kevin G.'
  };
  const commercial = Object.entries(sales).find(([key]) => n.includes(key))?.[1] || '';

  return { marque, modele, motorisation, mec: parseDate(text), immat, prixAchat, cessionOdoo, commercial };
}

export function parseMechanics(text) {
  const n = normalize(text);
  return {
    prepEsthetique: n.includes('pas de prepa') || n.includes('sans nettoyage') ? 'NON' : 'OUI',
    ct: /\bct\b/.test(n) || n.includes('controle technique') ? 'OUI' : 'NON',
    vidangeSimple: n.includes('vidange') && !n.includes('complete') ? 'OUI' : 'NON',
    vidangeComplete: n.includes('vidange complete') ? 'OUI' : 'NON',
    courroie: n.includes('courroie') || n.includes('distribution') ? 'OUI' : 'NON',
    pneus: n.includes('deux pneus') || n.includes('2 pneus') || n.includes('train de pneus') ? 'OUI, 2' : n.includes('pneu') ? 'OUI, 1' : 'NON',
    batterie: n.includes('batterie') ? 'OUI' : 'NON',
    autresMeca: '0'
  };
}

export function parseLines(text, max) {
  const raw = clean(text);
  if (!raw || ['rien', 'neant', 'néant', "vendu en l'etat", "vendu en l\u2019etat"].includes(normalize(raw))) return [];

  const lines = parseWorkLines(raw).slice(0, max);
  if (lines.length) return lines;

  return raw
    .split(/[,;\n.]+/)
    .map(clean)
    .filter(Boolean)
    .slice(0, max)
    .map((desc) => ({ id: `${Date.now()}-${Math.random()}`, desc, amount: '' }));
}

function parseWorkLines(raw) {
  const chunks = raw.split(/[,;\n.]+/).map(clean).filter(Boolean);
  const lines = [];
  let pendingParts = [];

  for (const chunk of chunks) {
    const extracted = extractAmount(chunk);
    if (extracted.amount) {
      if (extracted.desc) pendingParts.push(extracted.desc);
      const desc = clean(pendingParts.join(' '));
      if (desc) {
        lines.push({ id: `${Date.now()}-${Math.random()}`, desc, amount: extracted.amount });
      } else if (lines.length) {
        lines[lines.length - 1].amount = extracted.amount;
      }
      pendingParts = [];
    } else {
      pendingParts.push(chunk);
    }
  }

  if (pendingParts.length) {
    lines.push({ id: `${Date.now()}-${Math.random()}`, desc: clean(pendingParts.join(' ')), amount: '' });
  }

  return lines;
}

function extractAmount(text) {
  const original = clean(text);
  const n = normalize(original);

  const numeric = original.match(/^(.*?)(\d[\d\s.]*)\s*(euros?|€)\s*$/i);
  if (numeric) {
    return {
      desc: clean(numeric[1]).replace(/[,:;-]\s*$/, ''),
      amount: numeric[2].replace(/\D/g, '')
    };
  }

  if (!n.includes('euro')) return { desc: original, amount: '' };

  const beforeEuro = clean(original.replace(/euros?|€/gi, ''));
  const directAmount = frenchNumberToInt(beforeEuro);
  if (directAmount !== null) return { desc: '', amount: String(directAmount) };

  const words = beforeEuro.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const maybeAmount = words.slice(i).join(' ');
    const value = frenchNumberToInt(maybeAmount);
    if (value !== null) {
      return {
        desc: clean(words.slice(0, i).join(' ')).replace(/[,:;-]\s*$/, ''),
        amount: String(value)
      };
    }
  }

  return { desc: original, amount: '' };
}

function frenchNumberToInt(text) {
  const n = normalize(text)
    .replace(/-/g, ' ')
    .replace(/\bet\b/g, ' ')
    .replace(/\bd['']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!n) return null;
  if (/^\d+$/.test(n)) return Number(n);

  const units = {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
    six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
    treize: 13, quatorze: 14, quinze: 15, seize: 16
  };
  const tens = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };
  const special = {
    'dix sept': 17, 'dix huit': 18, 'dix neuf': 19,
    'soixante dix': 70, 'soixante onze': 71, 'soixante douze': 72,
    'soixante treize': 73, 'soixante quatorze': 74, 'soixante quinze': 75,
    'soixante seize': 76, 'soixante dix sept': 77, 'soixante dix huit': 78,
    'soixante dix neuf': 79,
    'quatre vingt': 80, 'quatre vingts': 80, 'quatre vingt dix': 90,
    'quatre vingt onze': 91, 'quatre vingt douze': 92, 'quatre vingt treize': 93,
    'quatre vingt quatorze': 94, 'quatre vingt quinze': 95, 'quatre vingt seize': 96,
    'quatre vingt dix sept': 97, 'quatre vingt dix huit': 98, 'quatre vingt dix neuf': 99
  };

  if (special[n] !== undefined) return special[n];
  if (units[n] !== undefined) return units[n];
  if (tens[n] !== undefined) return tens[n];

  const words = n.split(' ');
  let total = 0, current = 0, seen = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (units[w] !== undefined) { current += units[w]; seen = true; }
    else if (tens[w] !== undefined) { current += tens[w]; seen = true; }
    else if (w === 'cent' || w === 'cents') { if (current === 0) current = 1; current *= 100; seen = true; }
    else if (w === 'mille') { if (current === 0) current = 1; total += current * 1000; current = 0; seen = true; }
    else {
      const rest = words.slice(i).join(' ');
      if (special[rest] !== undefined) { current += special[rest]; seen = true; break; }
      return null;
    }
  }

  return seen ? total + current : null;
}

export function surpriseAmount(mec) {
  if (!mec) return 0;
  const [d, m, y] = String(mec).split('/').map(Number);
  if (!d || !m || !y) return 0;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return 0;
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (age <= 4) return 250;
  if (age <= 8) return 500;
  return 750;
}
