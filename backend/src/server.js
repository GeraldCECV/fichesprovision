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

// Ancien endpoint fallback regex
app.post('/api/analyze', (req, res) => {
  try {
    const { block, text } = req.body || {};
    res.json({ data: parseBlock(block, text || '') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Nouveau endpoint GPT — analyse complète en une seule dictée
app.post('/api/analyze-full', async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'OPENAI_API_KEY manquante.' });
    }

    const { text } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: 'Texte manquant.' });
    }

    const prompt = `
Tu es un assistant expert en concession camping-car pour Ypocamp Groupe Ypo Ouest.

À partir de cette dictée d'un commercial, extrais toutes les informations et retourne UNIQUEMENT un JSON valide.
Ne mets aucun texte avant ou après.
Ne mets aucune balise markdown.

Dictée :
"${text}"

Structure JSON attendue :

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
  "body": [
    { "desc": "", "amount": 0 }
  ],
  "cell": [
    { "desc": "", "amount": 0 }
  ]
}

Règles véhicule :
- La marque doit être corrigée phonétiquement si besoin.
- "imer", "Imer", "irmer", "haimer" = Hymer.
- "florette" = Fleurette.
- "rapido" = Rapido.
- La MEC doit être au format JJ/MM/AAAA.
- L'immatriculation doit être au format XX-000-XX si possible.
- Le prix d'achat doit être un nombre uniquement.
- La cession Odoo doit être 0 si elle n'est pas mentionnée.
- Le commercial doit être uniquement le prénom.

Règles mécanique :
- Tous les champs OUI/NON sont NON par défaut.
- Mettre OUI uniquement si le commercial le mentionne explicitement.
- "prépa", "préparation", "esthétique", "nettoyage" = prepEsthetique OUI.
- "CT", "contrôle technique" = ct OUI.
- "vidange" = vidangeSimple OUI.
- "vidange complète" = vidangeComplete OUI.
- "courroie", "courroie de distri", "courroie de distribution" = courroie OUI.
- "batterie" = batterie OUI.
- Pour les pneus, retourne "OUI, 1" ou "OUI, 2" si le nombre est mentionné, sinon "OUI".
- autresMeca doit être un montant en chiffres ou 0.

Règles travaux :
- Les travaux carrosserie vont dans body.
- Les travaux cellule vont dans cell.
- Maximum 6 lignes pour body.
- Maximum 14 lignes pour cell.
- Chaque ligne doit avoir une description et un montant.
- Si le montant n'est pas mentionné, mets 0.

Règles générales :
- Si une information texte n'est pas mentionnée, laisse une chaîne vide "".
- Si un montant n'est pas mentionné, mets 0.
- Convertis les nombres écrits en lettres en chiffres.
- Identifie la motorisation avec le porteur, la cylindrée et la puissance si mentionnés.
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1500
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);

    if (!Array.isArray(data.body)) data.body = [];
    if (!Array.isArray(data.cell)) data.cell = [];

    data.body = data.body.map((line) => ({
      ...line,
      id: createId()
    }));

    data.cell = data.cell.map((line) => ({
      ...line,
      id: createId()
    }));

    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur analyse GPT.' });
  }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!openai) {
      return res.status(400).json({ error: 'OPENAI_API_KEY manquante côté serveur.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun audio reçu.' });
    }

    const mime = req.file.mimetype || 'audio/webm';
    let ext = 'webm';

    if (mime.includes('mp4')) ext = 'mp4';
    else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
    else if (mime.includes('wav')) ext = 'wav';
    else if (mime.includes('ogg')) ext = 'ogg';
    else if (mime.includes('webm')) ext = 'webm';

    const audioFile = await toFile(
      fs.createReadStream(req.file.path),
      `audio.${ext}`,
      { type: mime }
    );

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'fr',
      prompt: `Contexte : concession camping-car Ypocamp.
Transcrire fidèlement une dictée métier VO.
Préserver marques, modèles, immatriculations, montants en euros, MEC, mise en circulation, cession Odoo, travaux cellule, carrosserie et mécanique.`
    });

    fs.unlink(req.file.path, () => {});

    res.json({ text: transcription.text || '' });
  } catch (error) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    res.status(500).json({ error: error.message || 'Erreur transcription.' });
  }
});

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
    const templatePath = path.resolve(__dirname, '../assets/template_fiche_provision.xlsx');

    await workbook.xlsx.readFile(templatePath);

    const sheet = workbook.worksheets[0];

    const v = payload.vehicle || {};
    const m = payload.mechanics || {};
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
    set(sheet, 'D23', m.pneus || 'NON');
    set(sheet, 'D24', m.batterie || 'NON');
    set(sheet, 'D25', number(m.autresMeca || 0));

    for (let r = 29; r <= 34; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    body.slice(0, 6).forEach((line, i) => {
      const r = 29 + i;
      set(sheet, `A${r}`, line.desc || '');
      set(sheet, `E${r}`, number(line.amount || 0));
    });

    for (let r = 38; r <= 51; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    cell.slice(0, 14).forEach((line, i) => {
      const r = 38 + i;
      set(sheet, `A${r}`, line.desc || '');
      set(sheet, `E${r}`, number(line.amount || 0));
    });

    for (let r = 54; r <= 57; r++) {
      set(sheet, `A${r}`, '');
      set(sheet, `E${r}`, '');
    }

    set(sheet, 'A54', 'Pack Fraicheur');
    set(sheet, 'A55', "Test d'humidité");
    set(sheet, 'E58', surpriseAmount(v.mec));

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
    res.status(500).json({ error: error.message || 'Erreur génération Excel.' });
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
    ['commercial', 'Réalisé par']
  ];

  return required
    .filter(([key]) => v[key] === undefined || v[key] === null || String(v[key]).trim() === '')
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

app.listen(port, () => {
  console.log(`API ready on ${port}`);
});
