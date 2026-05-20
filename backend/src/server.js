import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI, { toFile } from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import ExcelJS from 'exceljs';
import { parseBlock, surpriseAmount } from './parser.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const upload = multer({ dest: '/tmp' });

app.use(express.json({ limit: '20mb' }));
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true
}));

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.get('/', (_, res) => res.send('Provision VO Ypo Ouest API OK'));
app.get('/api/health', (_, res) => res.json({ ok: true }));

// Ancien endpoint (fallback regex)
app.post('/api/analyze', (req, res) => {
  try {
    const { block, text } = req.body || {};
    res.json({ data: parseBlock(block, text || '') });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Nouveau endpoint GPT â analyse complÃ¨te en une seule dictÃ©e
app.post('/api/analyze-full', async (req, res) => {
  try {
    if (!openai) return res.status(400).json({ error: 'OPENAI_API_KEY manquante.' });
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Texte manquant.' });

    const prompt = `Tu es un assistant expert en concession camping-car pour Ypocamp (Groupe Ypo Ouest).
Ã partir de cette dictÃ©e d'un commercial, extrais toutes les informations et retourne UNIQUEMENT un JSON valide, sans texte avant ni aprÃ¨s, sans balises markdown.

DictÃ©e : "${text}"

Structure JSON attendue :
{
  "vehicle": {
    "marque": "marque du camping-car (ex: Chausson, Fleurette, Pilote...)",
    "modele": "modÃ¨le exact (ex: Flash 788, Magister 74 LMF...)",
    "motorisation": "porteur + cylindrÃ©e + puissance (ex: Fiat Ducato 2.3L 140ch)",
    "mec": "date MEC au format JJ/MM/AAAA",
    "immat": "immatriculation au format XX-000-XX",
    "prixAchat": "prix d'achat en chiffres uniquement",
    "cessionOdoo": "montant cession Odoo en chiffres, 0 si absent",
    "commercial": "prÃ©nom du commercial"
  },
  "mechanics": {
    "prepEsthetique": "OUI ou NON",
    "ct": "OUI ou NON",
    "vidangeSimple": "OUI ou NON",
    "vidangeComplete": "OUI ou NON",
    "courroie": "OUI ou NON",
    "pneus": "NON ou OUI, 1 ou OUI, 2",
    "batterie": "OUI ou NON",
    "autresMeca": "montant en chiffres ou 0"
  },
  "body": [
    { "desc": "description travail carrosserie", "amount": "montant ou vide" }
  ],
  "cell": [
    { "desc": "description travail cellule", "amount": "montant ou vide" }
  ]
}

RÃ¨gles :
- Si une information n'est pas mentionnÃ©e, laisse le champ vide "" sauf pour les OUI/NON (mettre NON par dÃ©faut) et les montants (mettre 0).
- Pour la mÃ©canique, prepEsthetique est OUI par dÃ©faut sauf si explicitement dit "pas de prÃ©pa" ou "sans nettoyage".
- Les travaux carrosserie et cellule sont des listes (max 6 pour body, max 14 pour cell).
- Convertis les nombres Ã©crits en lettres : "soixante quatorze" â 74, "deux mille" â 2000.
- Pour la motorisation, identifie le porteur (Fiat Ducato, Peugeot Boxer, etc.) et la puissance si mentionnÃ©e.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1500
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const clean = raw.replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);

    // Ajouter des IDs aux lignes body/cell
    if (data.body) data.body = data.body.map(l => ({ ...l, id: `${Date.now()}-${Math.random()}` }));
    if (data.cell) data.cell = data.cell.map(l => ({ ...l, id: `${Date.now()}-${Math.random()}` }));

    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur analyse GPT.' });
  }
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!openai) return res.status(400).json({ error: 'OPENAI_API_KEY manquante cÃ´tÃ© serveur.' });
    if (!req.file) return res.status(400).json({ error: 'Aucun audio reÃ§u.' });

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
      prompt: 'Contexte: concession camping-car Ypocamp. Transcrire fidÃ¨lement une dictÃ©e mÃ©tier VO. PrÃ©server marques, modÃ¨les, immatriculations, montants en euros, MEC, mise en circulation, cession Odoo, travaux cellule, carrosserie et mÃ©canique.'
    });

    fs.unlink(req.file.path, () => {});
    res.json({ text: transcription.text || '' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur transcription.' });
  }
});

app.post('/api/generate-excel', async (req, res) => {
  try {
    const payload = req.body || {};
    const missing = validatePayload(payload);
    if (missing.length) return res.status(400).json({ error: `Champs obligatoires manquants : ${missing.join(', ')}` });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.resolve(__dirname, '../assets/template_fiche_provision.xlsx'));
    const sheet = workbook.worksheets[0];

    const v = payload.vehicle || {};
    const m = payload.mechanics || {};
    const body = payload.body || [];
    const cell = payload.cell || [];

    set(sheet, 'B8', v.marque);
    set(sheet, 'B9', v.modele);
    set(sheet, 'B10', v.motorisation);
    set(sheet, 'E8', v.mec);
    set(sheet, 'E9', v.immat);
    set(sheet, 'E10', number(v.prixAchat));
    set(sheet, 'E11', number(v.cessionOdoo));
    set(sheet, 'B12', v.commercial);
    set(sheet, 'E12', today());

    set(sheet, 'D14', m.prepEsthetique || 'OUI');
    set(sheet, 'D18', m.ct || 'NON');
    set(sheet, 'D19', m.vidangeSimple || 'NON');
    set(sheet, 'D20', m.vidangeComplete || 'NON');
    set(sheet, 'D21', m.courroie || 'NON');
    set(sheet, 'D22', 'NON');
    set(sheet, 'D23', m.pneus || 'NON');
    set(sheet, 'D24', m.batterie || 'NON');
    set(sheet, 'D25', number(m.autresMeca || 0));

    for (let r = 29; r <= 34; r++) { set(sheet, `A${r}`, ''); set(sheet, `E${r}`, ''); }
    body.slice(0, 6).forEach((line, i) => {
      const r = 29 + i;
      set(sheet, `A${r}`, line.desc || '');
      set(sheet, `E${r}`, number(line.amount || 0));
    });

    for (let r = 38; r <= 51; r++) { set(sheet, `A${r}`, ''); set(sheet, `E${r}`, ''); }
    cell.slice(0, 14).forEach((line, i) => {
      const r = 38 + i;
      set(sheet, `A${r}`, line.desc || '');
      set(sheet, `E${r}`, number(line.amount || 0));
    });

    for (let r = 54; r <= 57; r++) { set(sheet, `A${r}`, ''); set(sheet, `E${r}`, ''); }
    set(sheet, 'A54', 'Pack Fraicheur');
    set(sheet, 'A55', "Test d'humiditÃ©");
    set(sheet, 'E58', surpriseAmount(v.mec));

    const filename = safe(`${v.marque}-${v.modele}-${v.immat}.xlsx`);
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur gÃ©nÃ©ration Excel.' });
  }
});

function validatePayload(payload) {
  const v = payload.vehicle || {};
  const required = [
    ['marque', 'Marque'], ['modele', 'ModÃ¨le'], ['motorisation', 'Motorisation'], ['mec', 'MEC'],
    ['immat', 'Immatriculation'], ['prixAchat', "Prix d'achat"], ['cessionOdoo', 'Cession ODOO'], ['commercial', 'RÃ©alisÃ© par']
  ];
  return required.filter(([k]) => v[k] === undefined || v[k] === null || String(v[k]).trim() === '').map(([, label]) => label);
}

function set(sheet, cell, value) { sheet.getCell(cell).value = value; }
function number(v) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function safe(name) { return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); }

app.listen(port, () => console.log(`API ready on ${port}`));
