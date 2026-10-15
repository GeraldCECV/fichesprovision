// Shared by the browser, API and workbook. Monetary calculations use cents.
export const VEHICLE_LABELS = {
  marque: 'Marque',
  modele: 'Modèle',
  motorisation: 'Motorisation',
  mec: 'Première mise en circulation',
  immat: 'Immatriculation',
  kilometrage: 'Kilométrage',
  prixAchat: 'Prix d’achat HT',
  cessionOdoo: 'Cession Odoo HT',
  commercial: 'Réalisé par',
};
export const MECHANICS = {
  prepEsthetique: ['Préparation esthétique', 230],
  ct: ['Contrôle technique', 80],
  vidangeSimple: ['Vidange simple', 150],
  vidangeComplete: ['Vidange complète', 350],
  courroie: ['Distribution seule', 600],
  courroiePompe: ['Distribution + pompe à eau', 850],
  pneusAvant: ['Pneus avant (un train)', 400],
  pneusArriere: ['Pneus arrière (un train)', 400],
  batterie: ['Batterie moteur', 180],
};
export const INITIAL = {
  vehicle: Object.fromEntries(Object.keys(VEHICLE_LABELS).map((k) => [k, ''])),
  mechanics: {
    ...Object.fromEntries(Object.keys(MECHANICS).map((k) => [k, 'NON'])),
    autresMeca: '',
  },
  body: [],
  cell: [],
  inspection: { body: false, cell: false },
  fees: { admin: '1025', pack: '0', humidite: '0', divers: '0' },
  taxBasis: 'HT',
  notes: '',
};
export const makeId = () => globalThis.crypto.randomUUID();
export const money = (cents) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100) +
  ' HT';

export function parseCents(value, { empty = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    if (empty) return 0;
    throw new Error('Montant manquant');
  }
  const raw = String(value)
    .trim()
    .replace(/\s|\u00a0|\u202f/g, '')
    .replace(/€$/, '');
  // A single decimal separator, max 2 cents. Ambiguous thousands are rejected.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw new Error('Montant invalide : utilisez 1234,56');
  const [whole, decimals = ''] = raw.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 10000000000) throw new Error('Montant hors limites');
  return cents;
}
export const amountValue = (value) => (parseCents(value) / 100).toFixed(2);

function calendarToday(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
}

export function parseMec(value, now = new Date()) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('Date MEC complète requise');
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    y < 1900 ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d ||
    date > calendarToday(now)
  ) {
    throw new Error('Date MEC invalide ou future');
  }
  return date;
}

export function surpriseCents(mec, now = new Date()) {
  const date = parseMec(mec, now);
  now = calendarToday(now);
  const years = now.getUTCFullYear() - date.getUTCFullYear();
  const anniversaryPassed =
    now.getUTCMonth() > date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() >= date.getUTCDate());
  const age = years - (anniversaryPassed ? 0 : 1);
  // Preserve the original <=4 / <=8 age thresholds using exact anniversaries.
  const exactAnniversary =
    now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() === date.getUTCDate();
  return age < 4 || (age === 4 && exactAnniversary)
    ? 25000
    : age < 8 || (age === 8 && exactAnniversary)
      ? 50000
      : 75000;
}

export function totals(data, now = new Date()) {
  const safe = (value) => {
    try {
      return parseCents(value, { empty: true });
    } catch {
      return 0;
    }
  };
  const mechanics = Object.entries(MECHANICS).reduce(
    (s, [key, [, price]]) => s + (data.mechanics[key] === 'OUI' ? price * 100 : 0),
    safe(data.mechanics.autresMeca),
  );
  const body = data.body.reduce((s, l) => s + safe(l.amount), 0);
  const cell = data.cell.reduce((s, l) => s + safe(l.amount), 0);
  const fees = ['admin', 'pack', 'humidite', 'divers'].reduce(
    (s, key) => s + safe(data.fees[key]),
    0,
  );
  let surprise = null;
  try {
    surprise = surpriseCents(data.vehicle.mec, now);
  } catch {}
  const total = mechanics + body + cell + fees + (surprise ?? 0);
  return {
    mechanics,
    body,
    cell,
    fees,
    surprise,
    total,
    cost: safe(data.vehicle.prixAchat) + total,
  };
}

export function validate(data, now = new Date()) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });
  if (!data || typeof data !== 'object' || Array.isArray(data))
    return [{ path: '', message: 'Fiche invalide' }];
  const v = data.vehicle || {},
    m = data.mechanics || {};
  for (const key of ['marque', 'modele', 'motorisation', 'immat', 'commercial']) {
    if (typeof v[key] !== 'string' || !v[key].trim())
      add(`vehicle.${key}`, `${VEHICLE_LABELS[key]} : information requise`);
  }
  for (const [key, value] of Object.entries(v)) {
    if (!Object.hasOwn(VEHICLE_LABELS, key) || typeof value !== 'string' || value.length > 300)
      add(`vehicle.${key}`, 'Champ véhicule invalide');
  }
  try {
    parseMec(v.mec, now);
  } catch (e) {
    add('vehicle.mec', e.message);
  }
  if (!/^\d{1,7}$/.test(v.kilometrage || ''))
    add('vehicle.kilometrage', 'Kilométrage entier requis');
  for (const key of ['prixAchat', 'cessionOdoo']) {
    try {
      parseCents(v[key]);
    } catch (e) {
      add(`vehicle.${key}`, `${VEHICLE_LABELS[key]} : ${e.message}`);
    }
  }
  for (const key of Object.keys(MECHANICS)) {
    if (!['OUI', 'NON'].includes(m[key]))
      add(`mechanics.${key}`, `${MECHANICS[key][0]} : contrôle à terminer`);
  }
  if (m.vidangeSimple === 'OUI' && m.vidangeComplete === 'OUI')
    add('mechanics.vidangeComplete', 'Choisissez une seule vidange');
  if (m.courroie === 'OUI' && m.courroiePompe === 'OUI')
    add('mechanics.courroiePompe', 'Choisissez une seule distribution');
  try {
    parseCents(m.autresMeca, { empty: true });
  } catch (e) {
    add('mechanics.autresMeca', `Autres mécanique : ${e.message}`);
  }
  for (const block of ['body', 'cell']) {
    const lines = data[block];
    if (!Array.isArray(lines) || lines.length > 200) {
      add(block, 'Maximum 200 travaux par rubrique');
      continue;
    }
    if (data.inspection?.[block] !== true)
      add(
        `inspection.${block}`,
        `${block === 'body' ? 'Carrosserie' : 'Cellule'} : inspection à confirmer`,
      );
    lines.forEach((line, i) => {
      if (!line || typeof line.desc !== 'string' || !line.desc.trim() || line.desc.length > 1000)
        add(
          `${block}.${i}.desc`,
          `Travail ${i + 1} : description requise (1 000 caractères maximum)`,
        );
      try {
        parseCents(line?.amount);
      } catch (e) {
        add(`${block}.${i}.amount`, `Travail ${i + 1} : ${e.message}`);
      }
    });
  }
  for (const key of ['admin', 'pack', 'humidite', 'divers']) {
    try {
      parseCents(data.fees?.[key]);
    } catch (e) {
      add(`fees.${key}`, `Forfait ${key} : ${e.message}`);
    }
  }
  if (
    Object.keys(data.fees || {}).some(
      (key) => !['admin', 'pack', 'humidite', 'divers'].includes(key),
    )
  )
    add('fees', 'Frais non reconnus : vérifiez la fiche');
  if (data.taxBasis !== 'HT') add('taxBasis', 'Tous les montants doivent être HT');
  if (typeof data.notes !== 'string' || data.notes.length > 5000)
    add('notes', 'Notes : 5 000 caractères maximum');
  return errors;
}

export function applyProposal(data, block, proposal, mode = 'append') {
  const next = structuredClone(data);
  if (block === 'vehicle') {
    for (const [key, value] of Object.entries(proposal.vehicle || {})) {
      if (Object.hasOwn(VEHICLE_LABELS, key) && value !== null && String(value).trim())
        next.vehicle[key] = String(value).trim();
    }
  } else if (block === 'mechanics') {
    for (const [key, value] of Object.entries(proposal.mechanics || {})) {
      if (Object.hasOwn(MECHANICS, key) && ['OUI', 'NON'].includes(value)) {
        next.mechanics[key] = value;
        if (value === 'OUI') {
          const other = {
            vidangeSimple: 'vidangeComplete',
            vidangeComplete: 'vidangeSimple',
            courroie: 'courroiePompe',
            courroiePompe: 'courroie',
          }[key];
          if (other) next.mechanics[other] = 'NON';
        }
      }
      if (key === 'autresMeca' && value !== null) next.mechanics[key] = String(value);
    }
  } else if (['body', 'cell'].includes(block)) {
    const lines = (proposal[block] || []).map((l) => ({
      id: makeId(),
      desc: String(l.desc || '').trim(),
      amount: l.amount === null ? '' : String(l.amount),
    }));
    next[block] = mode === 'replace' ? lines : [...next[block], ...lines];
    next.inspection[block] = false;
  }
  return next;
}
