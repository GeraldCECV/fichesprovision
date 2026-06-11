import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI, { toFile } from 'openai';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = Number(process.env.PORT || 8080);

const upload = multer({
  dest: '/tmp',
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

app.use(express.json({ limit: '20mb' }));

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true,
}));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MOTORISATION_CATALOG = [
  'Fiat Ducato 2.3 120 ch',
  'Fiat Ducato 2.3 130 ch',
  'Fiat Ducato 2.3 140 ch',
  'Fiat Ducato 2.3 150 ch',
  'Fiat Ducato 2.3 160 ch',
  'Fiat Ducato 2.3 180 ch',
  'Fiat Ducato 2.2 120 ch',
  'Fiat Ducato 2.2 140 ch',
  'Fiat Ducato 2.2 160 ch',
  'Fiat Ducato 2.2 180 ch',

  'Peugeot Boxer 2.0 BlueHDi 130 ch',
  'Peugeot Boxer 2.2 BlueHDi 120 ch',
  'Peugeot Boxer 2.2 BlueHDi 140 ch',
  'Peugeot Boxer 2.2 BlueHDi 165 ch',

  'Citroën Jumper 2.0 BlueHDi 130 ch',
  'Citroën Jumper 2.2 BlueHDi 120 ch',
  'Citroën Jumper 2.2 BlueHDi 140 ch',
  'Citroën Jumper 2.2 BlueHDi 165 ch',

  'Ford Transit 2.0 EcoBlue 105 ch',
  'Ford Transit 2.0 EcoBlue 130 ch',
  'Ford Transit 2.0 EcoBlue 170 ch',
  'Ford Transit 2.0 EcoBlue 185 ch',
  'Ford Transit 2.2 TDCi 125 ch',
  'Ford Transit 2.2 TDCi 130 ch',
  'Ford Transit 2.2 TDCi 155 ch',

  'Mercedes Sprinter 2.1 CDI 143 ch',
  'Mercedes Sprinter 2.1 CDI 163 ch',
  'Mercedes Sprinter 2.0 CDI 150 ch',
  'Mercedes Sprinter 2.0 CDI 170 ch',
  'Mercedes Sprinter 2.0 CDI 190 ch',

  'Renault Master 2.3 dCi 125 ch',
  'Renault Master 2.3 dCi 130 ch',
  'Renault Master 2.3 dCi 135 ch',
  'Renault Master 2.3 dCi 145 ch',
  'Renault Master 2.3 dCi 150 ch',
  'Renault Master 2.3 dCi 165 ch',
  'Renault Master 2.3 dCi 180 ch',

  'Iveco Daily 2.3 136 ch',
  'Iveco Daily 3.0 146 ch',
  'Iveco Daily 3.0 160 ch',
  'Iveco Daily 3.0 180 ch',

  'Volkswagen Crafter 2.0 TDI 140 ch',
  'Volkswagen Crafter 2.0 TDI 177 ch',
  'Volkswagen Transporter 2.0 TDI 110 ch',
  'Volkswagen Transporter 2.0 TDI 150 ch',
  'Volkswagen Transporter 2.0 TDI 204 ch',

  'MAN TGE 2.0 TDI 140 ch',
  'MAN TGE 2.0 TDI 177 ch',
];

app.get('/', (_, res) => {
  res.send('Provision VO API OK');
});

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.post('/api/transcribe-and-analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'OPENAI_API_KEY manquante' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun audio reçu' });
    }

    const mime = req.file.mimetype || 'audio/webm';
    let ext = 'webm';

    if (mime.includes('mp4')) ext = 'mp4';
    else if (mime.includes('mpeg')) ext = 'mp3';
    else if (mime.includes('wav')) ext = 'wav';
    else if (mime.includes('ogg')) ext = 'ogg';

    const audioFile = await toFile(
      fs.createReadStream(req.file.path),
      `audio.${ext}`,
      { type: mime }
    );

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'fr',
      prompt: `Dictée VO camping-car Ypocamp. Préserver noms propres, marques camping-cars (Rapido, Hymer, Pilote, Adria, Bürstner, Laika, Chausson, Dethleffs, Fleurette, Autostar...), porteurs (Ducato, Boxer, Jumper, Transit, Sprinter, Master, Daily), immatriculations format français, dates MEC, prix en euros, travaux avec montants.

Variantes orales :
- "deux litres trois" = 2.3
- "deux litres deux" = 2.2
- "deux litres" = 2.0
- "cent trente" = 130
- "cent quarante" = 140
- "cent cinquante" = 150
- "cent soixante" = 160
- "cent soixante dix" = 170
- "cent quatre vingt" = 180

Porteurs :
- ducato = Fiat Ducato
- boxer = Peugeot Boxer
- jumper = Citroën Jumper
- transit = Ford Transit
- sprinter = Mercedes Sprinter
- master = Renault Master
- daily = Iveco Daily
- crafter = Volkswagen Crafter
- transporter = Volkswagen Transporter
- TGE = MAN TGE

Pneus :
- pneus avant = avant
- pneus arrière = arrière
- 4 pneus = avant + arrière
`,
    });

    const text = transcription.text || '';

    fs.unlink(req.file.path, () => {});

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant expert VO camping-car Ypocamp. Retourne UNIQUEMENT un JSON valide sans markdown ni backticks.

Format exact :
{"vehicle":{"marque":"","modele":"","motorisation":"","mec":"","immat":"","prixAchat":"","cessionOdoo":"","commercial":""},"mechanics":{"prepEsthetique":"NON","ct":"NON","vidangeSimple":"NON","vidangeComplete":"NON","courroie":"NON","pneusAvant":"NON","pneusArriere":"NON","pneus":"0","batterie":"NON","autresMeca":"0"},"body":[],"cell":[]}

Règles mécanique :
- prepEsthetique=OUI si prépa/nettoyage/esthétique
- ct=OUI si contrôle technique
- vidangeSimple=OUI si vidange (simple)
- vidangeComplete=OUI si vidange complète
- courroie=OUI si courroie distribution
- batterie=OUI si batterie
- pneusAvant=OUI si pneus avant, pneusArriere=OUI si pneus arrière, 4 pneus = avant+arrière
- pneus=0 (aucun), 1 (avant OU arrière), 2 (avant ET arrière)

Travaux carrosserie → body [{desc, amount}]
Travaux cellule → cell [{desc, amount}]

Motorisation : retranscrire EXACTEMENT ce qui est dit, sans corriger ni interpréter. Si "2 litres 2" est dit, écrire "2.2". Si "2 litres 3" est dit, écrire "2.3". Ne jamais substituer une cylindrée par une autre. Le serveur normalisera ensuite.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';

    const clean = raw
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const data = JSON.parse(clean);

    if (!data.vehicle) data.vehicle = {};
    if (!data.mechanics) data.mechanics = {};
    if (!Array.isArray(data.body)) data.body = [];
    if (!Array.isArray(data.cell)) data.cell = [];

    if (data.vehicle.motorisation) {
      data.vehicle.motorisation = normalizeMotorisation(data.vehicle.motorisation);
    }
    if (data.vehicle.immat) {
      data.vehicle.immat = formatImmat(data.vehicle.immat);
    }

    data.mechanics = normalizeMechanics(data.mechanics);
    data.body = normalizeLines(data.body);
    data.cell = normalizeLines(data.cell);

    return res.json({
      text,
      data,
    });
  } catch (error) {
    console.error(error);

    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    return res.status(500).json({
      error: error.message || 'Erreur transcription/analyse',
    });
  }
});

// ─── Route analyse seule (texte → GPT) ────────────────────────────────────────
// Utilisée quand l'utilisateur a corrigé la transcription avant analyse (point 7)
app.post('/api/analyze', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'OPENAI_API_KEY manquante' });
    }

    const { text, block } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Paramètre text manquant' });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant expert VO camping-car Ypocamp. Retourne UNIQUEMENT un JSON valide sans markdown ni backticks.\n\nFormat exact :\n{\"vehicle\":{\"marque\":\"\",\"modele\":\"\",\"motorisation\":\"\",\"mec\":\"\",\"immat\":\"\",\"prixAchat\":\"\",\"cessionOdoo\":\"\",\"commercial\":\"\"},\"mechanics\":{\"prepEsthetique\":\"NON\",\"ct\":\"NON\",\"vidangeSimple\":\"NON\",\"vidangeComplete\":\"NON\",\"courroie\":\"NON\",\"pneusAvant\":\"NON\",\"pneusArriere\":\"NON\",\"pneus\":\"0\",\"batterie\":\"NON\",\"autresMeca\":\"0\"},\"body\":[],\"cell\":[]}\n\nRègles mécanique :\n- prepEsthetique=OUI si prépa/nettoyage/esthétique\n- ct=OUI si contrôle technique\n- vidangeSimple=OUI si vidange (simple)\n- vidangeComplete=OUI si vidange complète\n- courroie=OUI si courroie distribution\n- batterie=OUI si batterie\n- pneusAvant=OUI si pneus avant, pneusArriere=OUI si pneus arrière, 4 pneus = avant+arrière\n- pneus=0 (aucun), 1 (avant OU arrière), 2 (avant ET arrière)\n\nTravaux carrosserie → body [{desc, amount}]\nTravaux cellule → cell [{desc, amount}]\n\nMotorisation : retranscrire EXACTEMENT ce qui est dit, sans corriger ni interpréter. Si "2 litres 2" est dit, écrire "2.2". Si "2 litres 3" est dit, écrire "2.3". Ne jamais substituer une cylindrée par une autre. Le serveur normalisera ensuite.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(clean);

    if (!data.vehicle) data.vehicle = {};
    if (!data.mechanics) data.mechanics = {};
    if (!Array.isArray(data.body)) data.body = [];
    if (!Array.isArray(data.cell)) data.cell = [];

    if (data.vehicle.motorisation) {
      data.vehicle.motorisation = normalizeMotorisation(data.vehicle.motorisation);
    }
    if (data.vehicle.immat) {
      data.vehicle.immat = formatImmat(data.vehicle.immat);
    }

    data.mechanics = normalizeMechanics(data.mechanics);
    data.body = normalizeLines(data.body);
    data.cell = normalizeLines(data.cell);

    return res.json({ data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Erreur analyse' });
  }
});

app.post('/api/generate-excel', async (req, res) => {
  try {
    const payload = req.body || {};

    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(
      path.resolve(__dirname, '../assets/template_fiche_provision.xlsx')
    );

    const sheet = workbook.worksheets[0];

    const v = payload.vehicle || {};
    const m = normalizeMechanics(payload.mechanics || {});
    const body = Array.isArray(payload.body) ? payload.body : [];
    const cell = Array.isArray(payload.cell) ? payload.cell : [];

    set(sheet, 'B8', v.marque || '');
    set(sheet, 'B9', v.modele || '');
    set(sheet, 'B10', normalizeMotorisation(v.motorisation || ''));

    set(sheet, 'E8', v.mec || '');
    set(sheet, 'E9', v.immat || '');

    set(sheet, 'E10', number(v.prixAchat));
    set(sheet, 'E11', number(v.cessionOdoo));

    set(sheet, 'B12', v.commercial || '');
    set(sheet, 'E12', today());

    set(sheet, 'D14', m.prepEsthetique);

    set(sheet, 'D18', m.ct);
    set(sheet, 'D19', m.vidangeSimple);
    set(sheet, 'D20', m.vidangeComplete);
    set(sheet, 'D21', m.courroie);

    set(sheet, 'D22', 'NON');
    set(sheet, 'D23', m.pneus);
    set(sheet, 'D24', m.batterie);
    set(sheet, 'D25', number(m.autresMeca));

    for (let r = 29; r <= 34; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    body.slice(0, 6).forEach((line, i) => {
      const row = 29 + i;
      set(sheet, `A${row}`, line.desc || '');
      set(sheet, `E${row}`, number(line.amount));
    });

    for (let r = 38; r <= 51; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    cell.slice(0, 14).forEach((line, i) => {
      const row = 38 + i;
      set(sheet, `A${row}`, line.desc || '');
      set(sheet, `E${row}`, number(line.amount));
    });

    set(sheet, 'A54', 'Pack Fraicheur');
    set(sheet, 'A55', "Test d'humidité");
    set(sheet, 'E58', getMauvaiseSurprise(v.mec));

    const filename =
      `Fiche_Provision_${cleanFileName(v.marque)}_${cleanFileName(v.modele)}_${cleanFileName(v.immat)}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message || 'Erreur génération Excel',
    });
  }
});

// Formate l'immatriculation au format français SIV : AA-123-BB
function formatImmat(value) {
  const raw = String(value || '').toUpperCase().replace(/[\s\-]/g, '');
  const siv = raw.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  if (siv) return `${siv[1]}-${siv[2]}-${siv[3]}`;
  return raw || value;
}

function normalizeMotorisation(value) {
  const original = String(value || '').trim();

  if (!original) return '';

  const normalizedInput = normalizeMotorText(original);

  let best = '';
  let bestScore = 0;

  for (const candidate of MOTORISATION_CATALOG) {
    const score = scoreMotorisation(normalizedInput, normalizeMotorText(candidate));

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (bestScore >= 3) return best;

  return fallbackMotorisation(original);
}

function scoreMotorisation(input, candidate) {
  let score = 0;

  const inputTokens = input.split(' ').filter(Boolean);
  const candidateTokens = candidate.split(' ').filter(Boolean);

  for (const token of candidateTokens) {
    if (inputTokens.includes(token)) {
      score += 1;
    }
  }

  const inputPower = input.match(/\b(105|110|120|125|130|135|140|143|145|150|155|160|163|165|170|177|180|185|190|204)\b/);
  const candidatePower = candidate.match(/\b(105|110|120|125|130|135|140|143|145|150|155|160|163|165|170|177|180|185|190|204)\b/);

  if (inputPower && candidatePower && inputPower[1] === candidatePower[1]) {
    score += 3;
  }

  const inputCyl = input.match(/\b(2\.0|2\.1|2\.2|2\.3|3\.0)\b/);
  const candidateCyl = candidate.match(/\b(2\.0|2\.1|2\.2|2\.3|3\.0)\b/);

  if (inputCyl && candidateCyl) {
    if (inputCyl[1] === candidateCyl[1]) {
      score += 5; // correspondance exacte cylindrée = bonus fort
    } else {
      score -= 5; // cylindrée différente = pénalité éliminatoire
    }
  }

  return score;
}

function normalizeMotorText(value) {
  let v = String(value || '').toLowerCase();

  v = v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  v = v
    .replace(/citroen/g, 'citroen')
    .replace(/ducato/g, 'fiat ducato')
    .replace(/boxer/g, 'peugeot boxer')
    .replace(/jumper/g, 'citroen jumper')
    .replace(/transit/g, 'ford transit')
    .replace(/sprinter/g, 'mercedes sprinter')
    .replace(/master/g, 'renault master')
    .replace(/daily/g, 'iveco daily')
    .replace(/crafter/g, 'volkswagen crafter')
    .replace(/transporter/g, 'volkswagen transporter')
    .replace(/\btge\b/g, 'man tge');

  v = v
    .replace(/deux litres trois/g, '2.3')
    .replace(/deux litre trois/g, '2.3')
    .replace(/2 litres 3/g, '2.3')
    .replace(/2 litre 3/g, '2.3')
    .replace(/deux litres deux/g, '2.2')
    .replace(/deux litre deux/g, '2.2')
    .replace(/2 litres 2/g, '2.2')
    .replace(/2 litre 2/g, '2.2')
    .replace(/deux litres un/g, '2.1')
    .replace(/deux litre un/g, '2.1')
    .replace(/deux litres/g, '2.0')
    .replace(/deux litre/g, '2.0')
    .replace(/trois litres/g, '3.0')
    .replace(/trois litre/g, '3.0');

  v = v
    .replace(/cent cinq/g, '105')
    .replace(/cent dix/g, '110')
    .replace(/cent vingt/g, '120')
    .replace(/cent vingt cinq/g, '125')
    .replace(/cent trente cinq/g, '135')
    .replace(/cent trente/g, '130')
    .replace(/cent quarante cinq/g, '145')
    .replace(/cent quarante trois/g, '143')
    .replace(/cent quarante/g, '140')
    .replace(/cent cinquante cinq/g, '155')
    .replace(/cent cinquante/g, '150')
    .replace(/cent soixante cinq/g, '165')
    .replace(/cent soixante trois/g, '163')
    .replace(/cent soixante/g, '160')
    .replace(/cent soixante dix sept/g, '177')
    .replace(/cent soixante dix/g, '170')
    .replace(/cent quatre vingt cinq/g, '185')
    .replace(/cent quatre vingt dix/g, '190')
    .replace(/cent quatre vingt/g, '180')
    .replace(/deux cent quatre/g, '204');

  v = v
    .replace(/chevaux/g, 'ch')
    .replace(/cheval/g, 'ch')
    .replace(/\bch\b/g, '')
    .replace(/blue hdi/g, 'bluehdi')
    .replace(/bluehdi/g, 'bluehdi')
    .replace(/tdci/g, 'tdci')
    .replace(/cdi/g, 'cdi')
    .replace(/dci/g, 'dci')
    .replace(/ecoblue/g, 'ecoblue')
    .replace(/eco blue/g, 'ecoblue');

  return v
    .replace(/[^\w.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackMotorisation(value) {
  let v = String(value || '').toLowerCase();

  if (!v.trim()) return '';

  v = v
    .replace(/ducato/g, 'Fiat Ducato')
    .replace(/boxer/g, 'Peugeot Boxer')
    .replace(/jumper/g, 'Citroën Jumper')
    .replace(/transit/g, 'Ford Transit')
    .replace(/sprinter/g, 'Mercedes Sprinter')
    .replace(/master/g, 'Renault Master')
    .replace(/daily/g, 'Iveco Daily')
    .replace(/crafter/g, 'Volkswagen Crafter')
    .replace(/transporter/g, 'Volkswagen Transporter')
    .replace(/\btge\b/g, 'MAN TGE');

  v = v
    .replace(/deux litres trois/g, '2.3')
    .replace(/deux litres deux/g, '2.2')
    .replace(/deux litres/g, '2.0')
    .replace(/trois litres/g, '3.0');

  v = v
    .replace(/cent trente/g, '130')
    .replace(/cent quarante/g, '140')
    .replace(/cent cinquante/g, '150')
    .replace(/cent soixante/g, '160')
    .replace(/cent soixante dix/g, '170')
    .replace(/cent quatre vingt/g, '180');

  v = v
    .replace(/\b105\b/g, '105 ch')
    .replace(/\b110\b/g, '110 ch')
    .replace(/\b120\b/g, '120 ch')
    .replace(/\b125\b/g, '125 ch')
    .replace(/\b130\b/g, '130 ch')
    .replace(/\b135\b/g, '135 ch')
    .replace(/\b140\b/g, '140 ch')
    .replace(/\b143\b/g, '143 ch')
    .replace(/\b145\b/g, '145 ch')
    .replace(/\b150\b/g, '150 ch')
    .replace(/\b155\b/g, '155 ch')
    .replace(/\b160\b/g, '160 ch')
    .replace(/\b163\b/g, '163 ch')
    .replace(/\b165\b/g, '165 ch')
    .replace(/\b170\b/g, '170 ch')
    .replace(/\b177\b/g, '177 ch')
    .replace(/\b180\b/g, '180 ch')
    .replace(/\b185\b/g, '185 ch')
    .replace(/\b190\b/g, '190 ch')
    .replace(/\b204\b/g, '204 ch');

  return v
    .replace(/ch ch/g, 'ch')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMechanics(m = {}) {
  const pneusAvant = m.pneusAvant === 'OUI' ? 'OUI' : 'NON';
  const pneusArriere = m.pneusArriere === 'OUI' ? 'OUI' : 'NON';

  return {
    prepEsthetique: m.prepEsthetique === 'OUI' ? 'OUI' : 'NON',
    ct: m.ct === 'OUI' ? 'OUI' : 'NON',
    vidangeSimple: m.vidangeSimple === 'OUI' ? 'OUI' : 'NON',
    vidangeComplete: m.vidangeComplete === 'OUI' ? 'OUI' : 'NON',
    courroie: m.courroie === 'OUI' ? 'OUI' : 'NON',

    pneusAvant,
    pneusArriere,

    pneus:
      pneusAvant === 'OUI' && pneusArriere === 'OUI'
        ? '2'
        : pneusAvant === 'OUI' || pneusArriere === 'OUI'
          ? '1'
          : '0',

    batterie: m.batterie === 'OUI' ? 'OUI' : 'NON',
    autresMeca: m.autresMeca || '0',
  };
}

function normalizeLines(lines = []) {
  if (!Array.isArray(lines)) return [];

  return lines
    .map(line => ({
      id: line.id || makeId(),
      desc: capitalizeFirst(line.desc || line.description || ''),
      amount: String(line.amount || line.montant || '').replace(/\D/g, ''),
    }))
    .filter(line => line.desc || line.amount);
}

function getMauvaiseSurprise(mec) {
  if (!mec) return 750;

  const value = String(mec)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const mois = {
    janvier: 0,
    fevrier: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    aout: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    decembre: 11,
  };

  let day = 1;
  let month = 0;
  let year = null;

  let match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]) - 1;
    year = Number(match[3]);
  }

  if (!year) {
    match = value.match(/^(\d{1,2})\/(\d{4})$/);
    if (match) {
      month = Number(match[1]) - 1;
      year = Number(match[2]);
    }
  }

  if (!year) {
    match = value.match(/^(\d{4})$/);
    if (match) {
      year = Number(match[1]);
    }
  }

  if (!year) {
    match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]) - 1;
      day = Number(match[3]);
    }
  }

  // Format texte : "20 avril 2023"
  if (!year) {
    match = value.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
    if (match && mois[match[2]] !== undefined) {
      day = Number(match[1]);
      month = mois[match[2]];
      year = Number(match[3]);
    }
  }

  // Format texte : "avril 2023"
  if (!year) {
    match = value.match(/^([a-z]+)\s+(\d{4})$/);
    if (match && mois[match[1]] !== undefined) {
      month = mois[match[1]];
      year = Number(match[2]);
    }
  }

  if (!year) return 750;

  const mecDate = new Date(year, month, day);
  const todayDate = new Date();

  const ageYears =
    (todayDate - mecDate) /
    (1000 * 60 * 60 * 24 * 365.25);

  if (ageYears <= 4) return 250;
  if (ageYears <= 8) return 500;

  return 750;
}

function set(sheet, cell, value) {
  sheet.getCell(cell).value = value;
}

function number(value) {
  const n = Number(
    String(value || '')
      .replace(/\s/g, '')
      .replace(',', '.')
  );

  return Number.isFinite(n) ? n : 0;
}

function today() {
  const d = new Date();

  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function cleanFileName(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .trim();
}

function capitalizeFirst(str = '') {
  const value = String(str).trim();

  if (!value) return '';

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

app.listen(port, () => {
  console.log(`API running on ${port}`);
});
