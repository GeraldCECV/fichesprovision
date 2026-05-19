export function normalize(text) {
  return String(text || '')
    .toLowerCase()
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

export function parseVehicle(text) {
  const n = normalize(text);

  const brands = {
    adria: 'Adria', challenger: 'Challenger', chausson: 'Chausson', dreamer: 'Dreamer',
    hymer: 'Hymer', irmer: 'Hymer', haimer: 'Hymer',
    burstner: 'Bürstner', buerstner: 'Bürstner',
    carthago: 'Carthago', kartago: 'Carthago',
    rapido: 'Rapido', pilote: 'Pilote', autostar: 'Autostar',
    bavaria: 'Bavaria', carado: 'Carado', dethleffs: 'Dethleffs',
    fleurette: 'Fleurette', mclouis: 'McLouis', 'mc louis': 'McLouis',
    possl: 'Pössl', poessl: 'Pössl', rollerteam: 'Roller Team', 'roller team': 'Roller Team'
  };

  const marque = Object.entries(brands).find(([key]) => n.includes(key))?.[1] || '';

  const models = [
    'Compact Select DC', 'Compact SP', 'Compact SC', 'Compact DL',
    'Cap Life', 'Twin 600 SP', 'Twin 640 SGX', '388 EB', 'V594', 'V697',
    'Tramp 598', 'Pacific P696D', 'Galaxy G740', 'Kronos 265 TL'
  ];
  const modele = models.find((m) => n.includes(normalize(m))) || '';

  const bases = [
    ['fiat ducato', 'Fiat Ducato'], ['ducato', 'Fiat Ducato'],
    ['ford transit', 'Ford Transit'], ['transit', 'Ford Transit'],
    ['mercedes sprinter', 'Mercedes Sprinter'], ['sprinter', 'Mercedes Sprinter'],
    ['jumper', 'Citroën Jumper'], ['boxer', 'Peugeot Boxer'],
    ['master', 'Renault Master'], ['crafter', 'Volkswagen Crafter']
  ];

  const base = bases.find(([key]) => n.includes(key))?.[1] || '';
  const cylinder = n.match(/(1\.6|2\.0|2\.2|2\.3|3\.0|2,2|2,3)/)?.[0]?.replace('.', ',') || '';
  const hp = n.match(/(\d{2,3})\s*(ch|chevaux)/)?.[1] || '';
  const motorisation = [
    base,
    cylinder ? `${cylinder} L` : '',
    hp ? `${hp} ch` : '',
    n.includes('automatique') || n.includes('bva') ? 'BVA' : ''
  ].filter(Boolean).join(' / ');

  const rawPlate = String(text).toUpperCase().replace(/[\s-]/g, '').match(/[A-Z]{2}\d{3}[A-Z]{2}/)?.[0] || '';
  const immat = rawPlate ? `${rawPlate.slice(0, 2)}-${rawPlate.slice(2, 5)}-${rawPlate.slice(5)}` : '';

  const prixAchat = n.match(/(?:achete|acheté|achat|prix)\D{0,25}(\d[\d\s.]{2,})/)?.[1]?.replace(/\D/g, '') || '';

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
  if (!raw || ['rien', 'neant', 'néant', "vendu en l'etat", 'vendu en l’état'].includes(normalize(raw))) return [];

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
  const chunks = raw
    .split(/[,;\n.]+/)
    .map(clean)
    .filter(Boolean);

  const lines = [];
  let pendingParts = [];

  for (const chunk of chunks) {
    const extracted = extractAmount(chunk);

    if (extracted.amount) {
      if (extracted.desc) pendingParts.push(extracted.desc);

      const desc = clean(pendingParts.join(' '));

      if (desc) {
        lines.push({
          id: `${Date.now()}-${Math.random()}`,
          desc,
          amount: extracted.amount
        });
      } else if (lines.length) {
        lines[lines.length - 1].amount = extracted.amount;
      }

      pendingParts = [];
    } else {
      pendingParts.push(chunk);
    }
  }

  if (pendingParts.length) {
    lines.push({
      id: `${Date.now()}-${Math.random()}`,
      desc: clean(pendingParts.join(' ')),
      amount: ''
    });
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

  if (!n.includes('euro')) {
    return { desc: original, amount: '' };
  }

  const beforeEuro = clean(original.replace(/euros?|€/gi, ''));
  const directAmount = frenchNumberToInt(beforeEuro);

  if (directAmount !== null) {
    return { desc: '', amount: String(directAmount) };
  }

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
    .replace(/\bd['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!n) return null;
  if (/^\d+$/.test(n)) return Number(n);

  const units = {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
    six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
    treize: 13, quatorze: 14, quinze: 15, seize: 16
  };

  const tens = {
    vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60
  };

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
  let total = 0;
  let current = 0;
  let seen = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    if (units[w] !== undefined) {
      current += units[w];
      seen = true;
    } else if (tens[w] !== undefined) {
      current += tens[w];
      seen = true;
    } else if (w === 'cent' || w === 'cents') {
      if (current === 0) current = 1;
      current *= 100;
      seen = true;
    } else if (w === 'mille') {
      if (current === 0) current = 1;
      total += current * 1000;
      current = 0;
      seen = true;
    } else {
      const rest = words.slice(i).join(' ');
      if (special[rest] !== undefined) {
        current += special[rest];
        seen = true;
        break;
      }
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