import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { buildWorkbook } from './workbook.js';
import { analyze } from './speech.js';

export function createApp({
  client,
  password = process.env.APP_PASSWORD,
  secret = process.env.APP_SESSION_SECRET,
  production = process.env.NODE_ENV === 'production',
} = {}) {
  if (production && (!password || password.length < 12 || !secret || secret.length < 32))
    throw new Error(
      'APP_PASSWORD (12 caractères minimum) et APP_SESSION_SECRET (32 minimum) requis en production',
    );
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (req.headers.origin && !origins.includes(req.headers.origin))
      return res.status(403).json({ error: 'Origine non autorisée' });
    next();
  });
  app.use(express.json({ limit: '512kb' }));
  const api =
    client ??
    (process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90000, maxRetries: 1 })
      : null);
  const signingSecret = secret || randomBytes(32).toString('hex'),
    salt = randomBytes(16);
  const passwordHash = password ? scryptSync(password, salt, 64) : null;
  const sign = (value) => createHmac('sha256', signingSecret).update(value).digest('base64url');
  const equal = (a, b) => a.length === b.length && timingSafeEqual(a, b);
  const limited = (limit, windowMs) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Trop de demandes. Réessayez dans quelques minutes.' },
    });
  app.get('/api/health', (_, res) =>
    res.json({ ok: true, authRequired: Boolean(password), speechAvailable: Boolean(api) }),
  );
  app.post('/api/login', limited(8, 15 * 60000), (req, res) => {
    const input = req.body?.password;
    if (
      typeof input !== 'string' ||
      input.length > 256 ||
      !passwordHash ||
      !equal(scryptSync(input, salt, 64), passwordHash)
    )
      return res.status(401).json({ error: 'Accès refusé' });
    const body = Buffer.from(
      JSON.stringify({ exp: Date.now() + 8 * 3600000, id: randomBytes(16).toString('hex') }),
    ).toString('base64url');
    res.json({ token: `${body}.${sign(body)}` });
  });
  app.use('/api', (req, res, next) => {
    if (!password) return next();
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      if (!token || token.length > 1000) throw new Error();
      const [body, signature, extra] = token.split('.');
      if (!body || !signature || extra || !equal(Buffer.from(signature), Buffer.from(sign(body))))
        throw new Error();
      if (!(JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now()))
        throw new Error();
      next();
    } catch {
      res
        .status(401)
        .json({ error: 'Session expirée. Reconnectez-vous ; votre brouillon est conservé.' });
    }
  });
  const aiLimit = limited(30, 15 * 60000);
  let activeAi = 0;
  const aiCapacity = (_, res, next) => {
    if (activeAi >= 2) {
      res.set('Retry-After', '10');
      return res
        .status(429)
        .json({ error: 'Deux dictées sont déjà en traitement. Réessayez dans quelques secondes.' });
    }
    activeAi++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeAi--;
      }
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 2 },
    fileFilter: (_, file, cb) => {
      if (
        ![
          'audio/webm',
          'audio/mp4',
          'audio/mpeg',
          'audio/wav',
          'audio/x-wav',
          'audio/ogg',
          'video/webm',
          'video/mp4',
        ].includes(file.mimetype.split(';')[0])
      )
        return cb(Object.assign(new Error('Format audio non pris en charge'), { status: 415 }));
      cb(null, true);
    },
  });
  app.post(
    '/api/transcribe',
    aiLimit,
    aiCapacity,
    upload.single('audio'),
    async (req, res, next) => {
      const controller = new AbortController();
      res.once('close', () => {
        if (!res.writableEnded) controller.abort();
      });
      try {
        if (!api)
          return res.status(503).json({
            error:
              'Dictée indisponible : configuration serveur requise. La saisie manuelle reste disponible.',
          });
        if (!req.file?.buffer?.length)
          return res.status(400).json({ error: 'Enregistrement vide' });
        const type = req.file.mimetype.split(';')[0];
        const ext =
          {
            'audio/mp4': 'mp4',
            'video/mp4': 'mp4',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'audio/x-wav': 'wav',
            'audio/ogg': 'ogg',
          }[type] || 'webm';
        const model = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe';
        const result = await api.audio.transcriptions.create(
          {
            file: await toFile(req.file.buffer, `dictee.${ext}`, { type }),
            model,
            language: 'fr',
            response_format: 'json',
            ...(['gpt-4o-transcribe', 'gpt-4o-mini-transcribe'].includes(model)
              ? { include: ['logprobs'] }
              : {}),
            prompt:
              'Inspection VO camping-car. Transcription fidèle sans ajout ni déduction. Marques, modèles, références alphanumériques, porteurs, cylindrées, puissances, plaques, dates, kilométrages, euros et centimes. Rapido, Hymer, Bürstner, Dethleffs, Chausson, Challenger, Pilote, Adria, Pössl, Globecar, Knaus, Weinsberg, Carthago, Malibu, Laika, Fleurette, Florium, Autostar, Frankia, Le Voyageur, Notin, Morelo, Concorde, Fiat Ducato, Ford Transit, Peugeot Boxer, Citroën Jumper, Mercedes Sprinter, Iveco Daily, Renault Master, Volkswagen Crafter, MAN TGE.',
          },
          { signal: controller.signal },
        );
        // A review hint only, never a certified confidence score or an export bypass.
        const uncertain = Array.isArray(result.logprobs)
          ? [
              ...new Set(
                result.logprobs
                  .filter((p) => p.logprob < -1.5 && /[\p{L}\p{N}]/u.test(p.token))
                  .map((p) => p.token.trim()),
              ),
            ].slice(0, 30)
          : [];
        res.json({ text: result.text || '', uncertain });
      } catch (e) {
        next(e);
      } finally {
        if (req.file?.buffer) req.file.buffer.fill(0);
      }
    },
  );
  app.post('/api/analyze', aiLimit, aiCapacity, async (req, res, next) => {
    const controller = new AbortController();
    res.once('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      if (!api)
        return res
          .status(503)
          .json({ error: 'Analyse vocale indisponible. Utilisez la saisie manuelle.' });
      const { text, block } = req.body || {};
      if (
        !['vehicle', 'mechanics', 'body', 'cell'].includes(block) ||
        typeof text !== 'string' ||
        !text.trim() ||
        text.length > 18000
      )
        return res
          .status(400)
          .json({ error: 'Texte ou rubrique invalide (18 000 caractères maximum)' });
      res.json({ data: await analyze(api, text, block, controller.signal) });
    } catch (e) {
      next(e);
    }
  });
  app.post('/api/generate-excel', limited(20, 15 * 60000), async (req, res, next) => {
    try {
      const wb = await buildWorkbook(req.body),
        buffer = await wb.xlsx.writeBuffer();
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Fiche_Provision_VO.xlsx"',
      });
      res.send(Buffer.from(buffer));
    } catch (e) {
      next(e);
    }
  });
  app.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    if (e.errors)
      return res
        .status(422)
        .json({ error: 'La fiche contient des informations à vérifier', errors: e.errors });
    if (e.status === 415) return res.status(415).json({ error: 'Format audio non pris en charge' });
    if (e instanceof multer.MulterError || e.type === 'entity.too.large')
      return res.status(413).json({ error: 'Enregistrement ou fiche trop volumineux' });
    console.error('Request failed', { route: req.path, type: e.name, status: e.status || 500 });
    res.status(502).json({
      error:
        'Le traitement a échoué. Votre saisie est conservée ; réessayez ou corrigez la transcription.',
    });
  });
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  createApp().listen(Number(process.env.PORT || 8080), '0.0.0.0', () =>
    console.log('Provision VO API prête'),
  );
