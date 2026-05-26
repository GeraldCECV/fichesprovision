import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI, { toFile } from 'openai';
import ExcelJS from 'exceljs';
import { parseBlock, surpriseAmount } from './parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = Number(process.env.PORT || 8080);

const upload = multer({
  dest: '/tmp',
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

app.use(express.json({ limit: '20mb' }));

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true
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

// =====================================================
// FALLBACK REGEX
// =====================================================

app.post('/api/analyze', (req, res) => {
  try {
    const { block, text } = req.body || {};

    res.json({
      data: parseBlock(block, text || '')
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });
  }
});

// =====================================================
// TRANSCRIPTION + ANALYSE GPT
// =====================================================

app.post('/api/transcribe-and-analyze', upload.single('audio'), async (req, res) => {

  try {

    if (!openai) {
      return res.status(400).json({
        error: 'OPENAI_API_KEY manquante.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'Aucun audio reçu.'
      });
    }

    // ============================================
    // TRANSCRIPTION AUDIO
    // ============================================

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
      model: 'whisper-1',
      language: 'fr',
      prompt: `
Contexte : concession camping-car Ypocamp.
Transcription dictée VO.
Préserver :
- marques
- modèles
- immatriculations
- montants
- MEC
- travaux carrosserie
- travaux cellule
- travaux mécanique
`
    });

    const text = transcription.text || '';

    fs.unlink(req.file.path, () => {});

    // ============================================
    // ANALYSE GPT
    // ============================================

    const prompt = `
Tu es un assistant Ypocamp.

Analyse cette dictée et retourne UNIQUEMENT un JSON valide.

Dictée :
"${text}"

Format attendu :

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
    "pneus": "NON",
    "batterie": "NON",
    "autresMeca": 0
  },

  "body": [],
  "cell": []
}

Règles :
- Tous les champs mécanique sont NON par défaut.
- "vidange" = vidangeSimple OUI.
- "vidange complète" = vidangeComplete OUI.
- "CT" = ct OUI.
- "courroie" = courroie OUI.
- "batterie" = batterie OUI.
- "prépa", "nettoyage" = prepEsthetique OUI.
- pneus = "OUI, 1" ou "OUI, 2" si mentionné.
- body = carrosserie.
- cell = cellule.
- montants en chiffres uniquement.
- retourner uniquement du JSON.
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1200
    });

    const raw = completion.choices[0]?.message?.content || '{}';

    const clean = raw
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const data = JSON.parse(clean);

    if (!Array.isArray(data.body)) {
      data.body = [];
    }

    if (!Array.isArray(data.cell)) {
      data.cell = [];
    }

    data.body = data.body.map((line) => ({
      ...line,
      id: createId()
    }));

    data.cell = data.cell.map((line) => ({
      ...line,
      id: createId()
    }));

    res.json({
      text,
      data
    });

  } catch (error) {

    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    res.status(500).json({
      error: error.message || 'Erreur transcription + analyse.'
    });
  }
});

// =====================================================
// GENERATION EXCEL
// =====================================================

app.post('/api/generate-excel', async (req, res) => {

  try {

    const payload = req.body || {};

    const missing = validatePayload(payload);

    if (missing.length) {
      return res.status(400).json({
        error: `Champs obligatoires manquants : ${missing.join(', ')}`
      });
    }

    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.readFile(
      path.resolve(__dirname, '../assets/template_fiche_provision.xlsx')
    );

    const sheet = workbook.worksheets[0];

    const v = payload.vehicle || {};
    const m = payload.mechanics || {};
    const body = payload.body || [];
    const cell = payload.cell || [];

    // ============================================
    // VEHICULE
    // ============================================

    set(sheet, 'B8', v.marque);
    set(sheet, 'B9', v.modele);
    set(sheet, 'B10', v.motorisation);
    set(sheet, 'E8', v.mec);
    set(sheet, 'E9', v.immat);
    set(sheet, 'E10', number(v.prixAchat));
    set(sheet, 'E11', number(v.cessionOdoo));
    set(sheet, 'B12', v.commercial);
    set(sheet, 'E12', today());

    // ============================================
    // MECANIQUE
    // ============================================

    set(sheet, 'D14', m.prepEsthetique || 'NON');
    set(sheet, 'D18', m.ct || 'NON');
    set(sheet, 'D19', m.vidangeSimple || 'NON');
    set(sheet, 'D20', m.vidangeComplete || 'NON');
    set(sheet, 'D21', m.courroie || 'NON');
    set(sheet, 'D22', 'NON');
    set(sheet, 'D23', m.pneus || 'NON');
    set(sheet, 'D24', m.batterie || 'NON');
    set(sheet, 'D25', number(m.autresMeca || 0));

    // ============================================
    // CARROSSERIE
    // ============================================

    for (let r = 29; r <= 34; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    body.slice(0, 6).forEach((line, i) => {

      const r = 29 + i;

      set(sheet, `A${r}`, line.desc || '');
      set(sheet, `E${r}`, number(line.amount || 0));
    });

    // ============================================
    // CELLULE
    // ============================================

    for (let r = 38; r <= 51; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    cell.slice(0, 14).forEach((line, i) => {

      const r = 38 + i;

      set(sheet, `A${r}`, line.desc || '');
      set(sheet, `E${r}`, number(line.amount || 0));
    });

    // ============================================
    // DIVERS
    // ============================================

    for (let r = 54; r <= 57; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    set(sheet, 'A54', 'Pack Fraicheur');
    set(sheet, 'A55', "Test d'humidité");

    // ============================================
    // MAUVAISES SURPRISES
    // ============================================

    set(sheet, 'E58', surpriseAmount(v.mec));

    // ============================================
    // NOM FICHIER
    // ============================================

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
      error: error.message || 'Erreur génération Excel.'
    });
  }
});

// =====================================================
// HELPERS
// =====================================================

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
    ['commercial', 'Réalisé par']
  ];

  return required
    .filter(([key]) => {
      return (
        v[key] === undefined ||
        v[key] === null ||
        String(v[key]).trim() === ''
      );
    })
    .map(([, label]) => label);
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

// =====================================================
// START SERVER
// =====================================================

app.listen(port, () => {
  console.log(`API ready on ${port}`);
});
