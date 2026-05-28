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
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

app.get('/', (_, res) => {
  res.send('Provision VO API OK');
});

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

app.post(
  '/api/transcribe-and-analyze',
  upload.single('audio'),
  async (req, res) => {
    try {
      if (!openai) {
        return res.status(400).json({
          error: 'OPENAI_API_KEY manquante',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Aucun audio reçu',
        });
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
        {
          type: mime,
        }
      );

      // -----------------------------
      // TRANSCRIPTION AUDIO
      // -----------------------------

      const transcription =
        await openai.audio.transcriptions.create({
          file: audioFile,

          model: 'gpt-4o-mini-transcribe',

          language: 'fr',

          prompt: `
Contexte : concession camping-car Ypocamp.

Dictée métier VO camping-car.

Préserver :
- marques
- modèles
- motorisations
- immatriculations
- MEC
- prix achat
- cession Odoo
- travaux mécanique
- travaux carrosserie
- travaux cellule

Motorisations fréquentes :
- Fiat Ducato 2.3 130 ch
- Fiat Ducato 2.3 140 ch
- Fiat Ducato 2.2 140 ch
- Fiat Ducato 2.2 180 ch
- Peugeot Boxer 2.2 140 ch
- Citroën Jumper 2.2 140 ch
- Ford Transit 2.0 130 ch
- Ford Transit 2.0 170 ch
- Mercedes Sprinter 2.2 143 ch
- Mercedes Sprinter 2.2 163 ch
- Renault Master 2.3 150 ch
- Iveco Daily 3.0 180 ch

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

Pneus :
- pneus avant = 1 train
- pneus arrière = 1 train
- 4 pneus = 2 trains
`,
        });

      const text = transcription.text || '';

      fs.unlink(req.file.path, () => {});

      // -----------------------------
      // ANALYSE GPT
      // -----------------------------

      const completion =
        await openai.chat.completions.create({
          model: 'gpt-4o-mini',

          temperature: 0.1,

          messages: [
            {
              role: 'system',

              content: `
Tu es un assistant expert VO camping-car Ypocamp.

Tu dois analyser la dictée et retourner uniquement un JSON valide.

Format attendu :

{
  "vehicle": {
    "marque": "",
    "modele": "",
    "motorisation": "",
    "mec": "",
    "immat": "",
    "prixAchat": "",
    "cessionOdoo": "",
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
    "autresMeca": "0"
  },

  "body": [],
  "cell": []
}

Règles :

- prep esthétique = OUI si nettoyage / prépa / esthétique.
- CT = OUI si contrôle technique.
- vidange simple = OUI si vidange.
- vidange complète = OUI si vidange complète.
- courroie = OUI si courroie distribution.

PNEUS :
- pneus avant = pneusAvant OUI
- pneus arrière = pneusArriere OUI
- 4 pneus = pneusAvant OUI + pneusArriere OUI

Calcul pneus :
- aucun = 0
- avant seul = 1
- arrière seul = 1
- avant + arrière = 2

body = carrosserie
cell = cellule

Toujours retourner du JSON valide.
`,
            },

            {
              role: 'user',
              content: text,
            },
          ],
        });

      const raw =
        completion.choices?.[0]?.message?.content || '{}';

      const clean = raw
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const data = JSON.parse(clean);

      // -----------------------------
      // NORMALISATION
      // -----------------------------

      if (!data.vehicle) {
        data.vehicle = {};
      }

      if (!data.mechanics) {
        data.mechanics = {};
      }

      if (!Array.isArray(data.body)) {
        data.body = [];
      }

      if (!Array.isArray(data.cell)) {
        data.cell = [];
      }

      // MOTORISATION

      if (data.vehicle.motorisation) {
        data.vehicle.motorisation =
          normalizeMotorisation(
            data.vehicle.motorisation
          );
      }

      // MECANIQUE

      data.mechanics =
        normalizeMechanics(data.mechanics);

      // BODY

      data.body = normalizeLines(data.body);

      // CELL

      data.cell = normalizeLines(data.cell);

      return res.json({
        text,
        data,
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        error:
          error.message ||
          'Erreur transcription/analyse',
      });
    }
  }
);

app.post(
  '/api/generate-excel',
  async (req, res) => {
    try {
      const payload = req.body || {};

      const workbook = new ExcelJS.Workbook();

      await workbook.xlsx.readFile(
        path.resolve(
          __dirname,
          '../assets/template_fiche_provision.xlsx'
        )
      );

      const sheet = workbook.worksheets[0];

      const v = payload.vehicle || {};

      const m = normalizeMechanics(
        payload.mechanics || {}
      );

      const body = Array.isArray(payload.body)
        ? payload.body
        : [];

      const cell = Array.isArray(payload.cell)
        ? payload.cell
        : [];

      // VEHICULE

      set(sheet, 'B8', v.marque || '');
      set(sheet, 'B9', v.modele || '');
      set(sheet, 'B10', v.motorisation || '');

      set(sheet, 'E8', v.mec || '');
      set(sheet, 'E9', v.immat || '');

      set(sheet, 'E10', number(v.prixAchat));
      set(sheet, 'E11', number(v.cessionOdoo));

      set(sheet, 'B12', v.commercial || '');

      set(sheet, 'E12', today());

      // MECANIQUE

      set(sheet, 'D14', m.prepEsthetique);

      set(sheet, 'D18', m.ct);
      set(sheet, 'D19', m.vidangeSimple);
      set(sheet, 'D20', m.vidangeComplete);
      set(sheet, 'D21', m.courroie);

      set(sheet, 'D22', 'NON');

      set(sheet, 'D23', m.pneus);

      set(sheet, 'D24', m.batterie);

      set(sheet, 'D25', number(m.autresMeca));

      // CARROSSERIE

      body.slice(0, 6).forEach((line, i) => {
        const row = 29 + i;

        set(sheet, `A${row}`, line.desc || '');
        set(sheet, `E${row}`, number(line.amount));
      });

      // CELLULE

      cell.slice(0, 14).forEach((line, i) => {
        const row = 38 + i;

        set(sheet, `A${row}`, line.desc || '');
        set(sheet, `E${row}`, number(line.amount));
      });

      // MAUVAISES SURPRISES

      set(
        sheet,
        'E58',
        getMauvaiseSurprise(v.mec)
      );

      const filename =
        `Fiche_Provision_${cleanFileName(v.marque)}_${cleanFileName(v.modele)}_${cleanFileName(v.immat)}.xlsx`;

      const buffer =
        await workbook.xlsx.writeBuffer();

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
        error:
          error.message ||
          'Erreur génération Excel',
      });
    }
  }
);

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function normalizeMotorisation(value) {
  let v = String(value || '').toLowerCase();

  if (!v.trim()) return '';

  v = v
    .replace(/ducato/g, 'Fiat Ducato')
    .replace(/boxer/g, 'Peugeot Boxer')
    .replace(/jumper/g, 'Citroën Jumper')
    .replace(/transit/g, 'Ford Transit')
    .replace(/sprinter/g, 'Mercedes Sprinter')
    .replace(/master/g, 'Renault Master')
    .replace(/daily/g, 'Iveco Daily');

  v = v
    .replace(/deux litres trois/g, '2.3')
    .replace(/deux litres deux/g, '2.2')
    .replace(/deux litres/g, '2.0');

  v = v
    .replace(/cent trente/g, '130')
    .replace(/cent quarante/g, '140')
    .replace(/cent cinquante/g, '150')
    .replace(/cent soixante/g, '160')
    .replace(/cent soixante dix/g, '170')
    .replace(/cent quatre vingt/g, '180');

  v = v
    .replace(/\b130\b/g, '130 ch')
    .replace(/\b140\b/g, '140 ch')
    .replace(/\b150\b/g, '150 ch')
    .replace(/\b160\b/g, '160 ch')
    .replace(/\b170\b/g, '170 ch')
    .replace(/\b180\b/g, '180 ch');

  return v
    .replace(/ch ch/g, 'ch')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMechanics(m = {}) {
  const pneusAvant =
    m.pneusAvant === 'OUI'
      ? 'OUI'
      : 'NON';

  const pneusArriere =
    m.pneusArriere === 'OUI'
      ? 'OUI'
      : 'NON';

  return {
    prepEsthetique:
      m.prepEsthetique === 'OUI'
        ? 'OUI'
        : 'NON',

    ct:
      m.ct === 'OUI'
        ? 'OUI'
        : 'NON',

    vidangeSimple:
      m.vidangeSimple === 'OUI'
        ? 'OUI'
        : 'NON',

    vidangeComplete:
      m.vidangeComplete === 'OUI'
        ? 'OUI'
        : 'NON',

    courroie:
      m.courroie === 'OUI'
        ? 'OUI'
        : 'NON',

    pneusAvant,
    pneusArriere,

    pneus:
      pneusAvant === 'OUI' &&
      pneusArriere === 'OUI'
        ? '2'
        : pneusAvant === 'OUI' ||
          pneusArriere === 'OUI'
        ? '1'
        : '0',

    batterie:
      m.batterie === 'OUI'
        ? 'OUI'
        : 'NON',

    autresMeca:
      m.autresMeca || '0',
  };
}

function normalizeLines(lines = []) {
  if (!Array.isArray(lines)) return [];

  return lines.map(line => ({
    id: makeId(),

    desc: capitalizeFirst(
      line.desc ||
        line.description ||
        ''
    ),

    amount: String(
      line.amount ||
        line.montant ||
        ''
    ).replace(/\D/g, ''),
  }));
}

function getMauvaiseSurprise(mec) {
  if (!mec) return 750;

  const match =
    String(mec).match(
      /^(\d{2})\/(\d{2})\/(\d{4})$/
    );

  if (!match) return 750;

  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );

  const years =
    (Date.now() - date.getTime()) /
    (1000 * 60 * 60 * 24 * 365.25);

  if (years <= 4) return 250;

  if (years <= 8) return 500;

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

  return Number.isFinite(n)
    ? n
    : 0;
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

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function makeId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

app.listen(port, () => {
  console.log(
    `API running on ${port}`
  );
});
