import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI, { toFile } from 'openai';
import ExcelJS from 'exceljs';
import { parseBlock } from './parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = Number(process.env.PORT || 8080);

const upload = multer({
  dest: '/tmp',
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.use(express.json({ limit: '20mb' }));

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true,
}));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.get('/', (_, res) => {
  res.send('Provision VO Ypo Ouest API OK');
});

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.post('/api/analyze', (req, res) => {
  try {
    const { block, text } = req.body || {};
    res.json({ data: parseBlock(block, text || '') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/transcribe-and-analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!openai) return res.status(400).json({ error: 'OPENAI_API_KEY manquante.' });
    if (!req.file) return res.status(400).json({ error: 'Aucun audio reçu.' });

    const mime = req.file.mimetype || 'audio/webm';
    let ext = 'webm';

    if (mime.includes('mp4')) ext = 'mp4';
    else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
    else if (mime.includes('wav')) ext = 'wav';
    else if (mime.includes('ogg')) ext = 'ogg';

    const audioFile = await toFile(
      fs.createReadStream(req.file.path),
      `audio.${ext}`,
      { type: mime }
    );

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-mini-transcribe',
      language: 'fr',
      prompt: `
Contexte : concession camping-car Ypocamp.
Dictée métier VO camping-car.
Préserver marques, modèles, immatriculations, montants, MEC, cession Odoo, travaux carrosserie, cellule et mécanique.
Pour les pneus : préserver si le commercial dit avant, arrière, pneus avant, pneus arrière, les 4 pneus.
`,
    });

    const text = transcription.text || '';
    fs.unlink(req.file.path, () => {});

    const prompt = `
Tu es un assistant expert Ypocamp.

Analyse cette dictée de reprise VO camping-car et retourne UNIQUEMENT un JSON valide.

Dictée :
"${text}"

Format JSON attendu :

{
  "vehicle": {
    "marque": "",
    "modele": "",
    "motorisation": "",
    "mec": "",
    "immat": "",
    "prixAchat": 0,
    "cessionOdoo": 0,
    "commercial": ""
  },
  "mechanics": {
    "prepEsthetique": "NON",
    "ct": "NON",
    "vidangeSimple": "NON",
    "vidangeComplete": "NON",
    "courroie": "NON",
    "pneusAvant": "NON",
    "pneusArriere": "NON",
    "pneus": "0",
    "batterie": "NON",
    "autresMeca": 0
  },
  "body": [],
  "cell": []
}

Règles mécanique :
- Tous les champs OUI/NON = NON par défaut.
- "prépa", "préparation", "esthétique", "nettoyage" = prepEsthetique OUI.
- "CT", "contrôle technique" = ct OUI.
- "vidange" = vidangeSimple OUI.
- "vidange complète" = vidangeComplete OUI.
- "courroie", "courroie de distribution", "courroie de distri" = courroie OUI.
- "batterie" = batterie OUI.

Règles pneus :
- "pneus avant", "changer les pneus avant", "train avant" = pneusAvant OUI.
- "pneus arrière", "pneus arriere", "changer les pneus arrière", "train arrière" = pneusArriere OUI.
- "4 pneus", "quatre pneus", "les pneus", "tous les pneus" = pneusAvant OUI et pneusArriere OUI.
- Si seulement "pneus" sans précision, mettre pneusAvant OUI.
- pneus = "0" si aucun.
- pneus = "1" si pneusAvant OUI ou pneusArriere OUI.
- pneus = "2" si pneusAvant OUI et pneusArriere OUI.

Règles travaux :
- body = carrosserie.
- cell = cellule.
- Format ligne : { "desc": "description", "amount": 0 }.
- Si montant non mentionné, amount = 0.

Retourne uniquement le JSON, sans markdown.
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(clean);

    if (!data.vehicle) data.vehicle = {};
    if (!data.mechanics) data.mechanics = {};
    if (!Array.isArray(data.body)) data.body = [];
    if (!Array.isArray(data.cell)) data.cell = [];

    data.mechanics = normalizeMechanics(data.mechanics);

    data.body = data.body.map(line => ({ ...line, id: createId() }));
    data.cell = data.cell.map(line => ({ ...line, id: createId() }));

    res.json({ text, data });

  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: error.message || 'Erreur transcription + analyse.' });
  }
});

app.post('/api/generate-excel', async (req, res) => {
  try {
    const payload = req.body || {};
    const missing = validatePayload(payload);

    if (missing.length) {
      return res.status(400).json({
        error: `Champs obligatoires manquants : ${missing.join(', ')}`,
      });
    }

    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(
      path.resolve(__dirname, '../assets/template_fiche_provision.xlsx')
    );

    const sheet = workbook.worksheets[0];

    const v = payload.vehicle || {};
    const m = normalizeMechanics(payload.mechanics || {});
    const body = Array.isArray(payload.body) ? payload.body : [];
    const cell = Array.isArray(payload.cell) ? payload.cell : [];

    set(sheet, 'B8', v.marque);
    set(sheet, 'B9', v.modele);
    set(sheet, 'B10', v.motorisation);
    set(sheet, 'E8', v.mec);
    set(sheet, 'E9', v.immat);
    set(sheet, 'E10', number(v.prixAchat));
    set(sheet, 'E11', number(v.cessionOdoo));
    set(sheet, 'B12', v.commercial);
    set(sheet, 'E12', today());

    set(sheet, 'D14', m.prepEsthetique || 'NON');
    set(sheet, 'D18', m.ct || 'NON');
    set(sheet, 'D19', m.vidangeSimple || 'NON');
    set(sheet, 'D20', m.vidangeComplete || 'NON');
    set(sheet, 'D21', m.courroie || 'NON');
    set(sheet, 'D22', 'NON');
    set(sheet, 'D23', m.pneus);
    set(sheet, 'D24', m.batterie || 'NON');
    set(sheet, 'D25', number(m.autresMeca || 0));

    for (let r = 29; r <= 34; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    body.slice(0, 6).forEach((line, i) => {
      const r = 29 + i;
      set(sheet, `A${r}`, line.desc || line.description || '');
      set(sheet, `E${r}`, number(line.amount || line.montant || 0));
    });

    for (let r = 38; r <= 51; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    cell.slice(0, 14).forEach((line, i) => {
      const r = 38 + i;
      set(sheet, `A${r}`, line.desc || line.description || '');
      set(sheet, `E${r}`, number(line.amount || line.montant || 0));
    });

    for (let r = 54; r <= 57; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

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
    res.status(500).json({
      error: error.message || 'Erreur génération Excel.',
    });
  }
});

function validatePayload(payload) {
  const v = payload.vehicle || {};

  const required = [
    ['marque', 'Marque'],
    ['modele', 'Modèle'],
    ['motorisation', 'Motorisation'],
    ['mec', 'MEC'],
    ['immat', 'Immatriculation'],
    ['prixAchat', "Prix d'achat"],
    ['cessionOdoo', 'Cession ODOO'],
    ['commercial', 'Réalisé par'],
  ];

  return required
    .filter(([key]) => (
      v[key] === undefined ||
      v[key] === null ||
      String(v[key]).trim() === ''
    ))
    .map(([, label]) => label);
}

function normalizeMechanics(mechanics = {}) {
  const pneusAvant = isOui(mechanics.pneusAvant) ? 'OUI' : 'NON';
  const pneusArriere = isOui(mechanics.pneusArriere) ? 'OUI' : 'NON';

  let pneus = '0';

  if (pneusAvant === 'OUI' && pneusArriere === 'OUI') pneus = '2';
  else if (pneusAvant === 'OUI' || pneusArriere === 'OUI') pneus = '1';
  else pneus = normalizePneus(mechanics.pneus);

  return {
    prepEsthetique: isOui(mechanics.prepEsthetique) ? 'OUI' : 'NON',
    ct: isOui(mechanics.ct) ? 'OUI' : 'NON',
    vidangeSimple: isOui(mechanics.vidangeSimple) ? 'OUI' : 'NON',
    vidangeComplete: isOui(mechanics.vidangeComplete) ? 'OUI' : 'NON',
    courroie: isOui(mechanics.courroie) ? 'OUI' : 'NON',
    pneusAvant,
    pneusArriere,
    pneus,
    batterie: isOui(mechanics.batterie) ? 'OUI' : 'NON',
    autresMeca: number(mechanics.autresMeca || 0),
  };
}

function isOui(value) {
  return String(value || '').toUpperCase().trim() === 'OUI';
}

function normalizePneus(value) {
  const raw = String(value ?? '').toLowerCase().trim();

  if (!raw || raw === 'non' || raw === '0') return '0';

  if (
    raw === '2' ||
    raw.includes('2') ||
    raw.includes('deux') ||
    raw.includes('4') ||
    raw.includes('quatre')
  ) {
    return '2';
  }

  if (
    raw === '1' ||
    raw.includes('1') ||
    raw.includes('un') ||
    raw.includes('oui') ||
    raw.includes('avant') ||
    raw.includes('arrière') ||
    raw.includes('arriere') ||
    raw.includes('pneu')
  ) {
    return '1';
  }

  return '0';
}

function set(sheet, cell, value) {
  sheet.getCell(cell).value = value;
}

function number(value) {
  const n = Number(
    String(value ?? '')
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

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getMauvaiseSurprise(mec) {
  if (!mec) return 750;

  const value = String(mec).trim();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) return 750;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);

  const mecDate = new Date(year, month, day);
  const todayDate = new Date();

  if (Number.isNaN(mecDate.getTime())) return 750;

  const ageMs = todayDate - mecDate;
  const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);

  if (ageYears <= 4) return 250;
  if (ageYears <= 8) return 500;

  return 750;
}

app.listen(port, () => {
  console.log(`API ready on ${port}`);
});
