import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  INITIAL,
  VEHICLE_LABELS,
  MECHANICS,
  money,
  totals,
  validate,
  applyProposal,
  makeId,
} from '../../backend/src/domain.js';
import { BRANDS, ENGINE_HINTS } from './catalog.js';
import './style.css';

const API =
  import.meta.env.VITE_PRODUCTION_API_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8080';
const DRAFT = 'provision-vo-draft-v2';
const STEPS = [
  ['vehicle', 'Le véhicule', 'Identité & acquisition'],
  ['mechanics', 'La mécanique', 'Contrôles & forfaits'],
  ['body', 'La carrosserie', 'Défauts & réparations'],
  ['cell', 'La cellule', 'Équipements & étanchéité'],
  ['validation', 'La provision', 'Relecture & export'],
];
const empty = () => ({
  data: structuredClone(INITIAL),
  texts: { vehicle: '', mechanics: '', body: '', cell: '' },
  voiceWarnings: {},
  review: null,
  active: 'vehicle',
});
function restore() {
  try {
    const raw = sessionStorage.getItem(DRAFT) || localStorage.getItem(DRAFT);
    if (!raw) return empty();
    const saved = JSON.parse(raw);
    if (
      saved.version !== 2 ||
      !saved.data?.vehicle ||
      !saved.data?.mechanics ||
      !Array.isArray(saved.data.body) ||
      !Array.isArray(saved.data.cell) ||
      !saved.data.fees ||
      !saved.data.inspection
    )
      return empty();
    const { vin, stock, ...vehicle } = saved.data.vehicle;
    return {
      ...empty(),
      ...saved,
      voiceWarnings: {},
      data: {
        ...saved.data,
        vehicle,
        taxBasis: 'HT',
        mechanics: {
          ...saved.data.mechanics,
          ...Object.fromEntries(
            Object.keys(MECHANICS).map((key) => [
              key,
              saved.data.mechanics[key] === 'OUI' ? 'OUI' : 'NON',
            ]),
          ),
        },
      },
      active: STEPS.some(([s]) => s === saved.active) ? saved.active : 'vehicle',
    };
  } catch {
    return empty();
  }
}
function App() {
  const [form, setForm] = useState(restore),
    { data, texts, review, active } = form;
  const [remember, setRemember] = useState(() => {
    try {
      return (
        Boolean(localStorage.getItem(DRAFT)) ||
        window.matchMedia('(display-mode: standalone)').matches ||
        Boolean(navigator.standalone)
      );
    } catch {
      return false;
    }
  });
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [voiceDetails, setVoiceDetails] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState(null);
  useEffect(() => {
    if (voiceNotice?.kind !== 'success') return;
    const timeout = setTimeout(() => setVoiceNotice(null), 6000);
    return () => clearTimeout(timeout);
  }, [voiceNotice]);
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone),
  );
  useEffect(() => {
    const capture = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const done = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallHelp(false);
    };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') setInstallHelp(false);
    } else setInstallHelp((value) => !value);
  }
  const [saveStatus, setSaveStatus] = useState(''),
    [status, setStatus] = useState('');
  const [health, setHealth] = useState(null),
    [token, setToken] = useState(''),
    [password, setPassword] = useState('');
  const [busy, setBusy] = useState(''),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState(null),
    [undo, setUndo] = useState(null),
    [replace, setReplace] = useState(false),
    [reviewConfirmed, setReviewConfirmed] = useState(false);
  const recorder = useRef(null),
    stream = useRef(null),
    timer = useRef(null),
    chunks = useRef([]),
    size = useRef(0),
    abort = useRef(null),
    voiceBlock = useRef(null),
    generation = useRef(0),
    lastBlob = useRef(null),
    appliedAudio = useRef(new WeakSet());
  const step = STEPS.findIndex(([id]) => id === active),
    financial = totals(data);
  const errors = validate(data),
    locked = Boolean(busy || recording);
  const loginNeeded = health?.authRequired && !token;
  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) {
      document
        .querySelector('nav [aria-current="step"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [active]);
  useEffect(() => {
    let stopped = false;
    let retryTimer;
    let connectionController;
    let attempts = 0;
    async function connect() {
      connectionController = new AbortController();
      const deadline = setTimeout(() => connectionController.abort(), 20000);
      try {
        const response = await fetch(`${API}/api/health`, { signal: connectionController.signal });
        if (!response.ok) throw new Error('Connexion indisponible');
        const result = await response.json();
        if (!result.ok) throw new Error('Serveur indisponible');
        if (!stopped) setHealth(result);
      } catch {
        if (!stopped)
          retryTimer = setTimeout(connect, Math.min(30000, 3000 * 2 ** Math.min(attempts++, 4)));
      } finally {
        clearTimeout(deadline);
      }
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      connectionController?.abort();
      generation.current++;
      clearInterval(timer.current);
      abort.current?.abort();
      if (recorder.current?.state === 'recording') {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.stringify({ ...form, version: 2, savedAt: new Date().toISOString() });
      sessionStorage.setItem(DRAFT, saved);
      if (remember) localStorage.setItem(DRAFT, saved);
      else localStorage.removeItem(DRAFT);
      setSaveStatus(
        remember ? 'Brouillon conservé sur cet appareil' : 'Brouillon conservé dans cet onglet',
      );
    } catch {
      setSaveStatus('Sauvegarde impossible : exportez avant de quitter');
      setStatus(
        'Le navigateur empêche la sauvegarde du brouillon. Ne fermez pas cet onglet avant l’export.',
      );
    }
  }, [form, remember]);
  useEffect(() => {
    const warn = (e) => {
      if (recording || busy) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording, busy]);
  useEffect(
    () => () => {
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );

  function change(fn) {
    setUndo(null);
    setReviewConfirmed(false);
    setForm((prev) => ({ ...prev, data: { ...fn(structuredClone(prev.data)) } }));
  }
  function field(path, value) {
    change((next) => {
      const [group, key] = path.split('.');
      next[group][key] = value;
      return next;
    });
  }
  const fieldError = (path) =>
    active === 'validation' ? errors.find((e) => e.path === path)?.message : '';
  async function request(path, body, isForm = false) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 110000);
    try {
      const res = await fetch(`${API}${path}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: isForm ? body : JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) setToken('');
        throw new Error(
          json.errors?.map((e) => e.message).join(' • ') || json.error || 'Traitement indisponible',
        );
      }
      return res;
    } catch (e) {
      if (e.name === 'AbortError')
        throw new Error(
          'Traitement interrompu ou trop long. La saisie et l’enregistrement sont conservés.',
        );
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  async function login(e) {
    e.preventDefault();
    setBusy('Connexion');
    try {
      const json = await (await request('/api/login', { password })).json();
      setToken(json.token);
      setPassword('');
      setStatus('Connexion établie pour cette session.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy('');
    }
  }

  async function transcribe(blob, block) {
    const operation = generation.current;
    setBusy('Reconnaissance et remplissage en cours');
    setVoiceNotice({ kind: 'processing', message: 'Reconnaissance et remplissage en cours…' });
    setStatus('');
    try {
      const fd = new FormData();
      const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      fd.append('audio', blob, `dictee.${ext}`);
      if (!appliedAudio.current.has(blob)) fd.append('block', block);
      const json = await (await request('/api/transcribe', fd, true)).json();
      if (operation !== generation.current) return;
      if (!json.text?.trim()) throw new Error('Aucune parole reconnue. Réécoutez ou recommencez.');
      setForm((prev) => ({
        ...prev,
        texts: { ...prev.texts, [block]: json.text },
        voiceWarnings: { ...prev.voiceWarnings, [block]: json.uncertain || [] },
        review: null,
        data: { ...prev.data },
      }));
      if (appliedAudio.current.has(blob)) {
        setVoiceNotice({ kind: 'success', message: 'Cet audio a déjà rempli les champs.' });
        setStatus(
          'Transcription relancée. Cet enregistrement a déjà rempli les champs ; modifiez-les directement ou analysez le texte corrigé.',
        );
        return;
      }
      setBusy('Remplissage automatique des champs');
      if (json.analysisError) throw new Error(json.analysisError);
      const result = json.data
        ? { data: json.data }
        : await (await request('/api/analyze', { text: json.text, block })).json();
      if (operation !== generation.current) return;
      const recognized = result.data?.[block];
      const hasInformation = Array.isArray(recognized)
        ? recognized.length > 0
        : recognized &&
          Object.values(recognized).some(
            (value) => value !== null && value !== undefined && String(value).trim() !== '',
          );
      if (!hasInformation) {
        setVoiceDetails(true);
        throw new Error(
          'Aucune information reconnue pour cette rubrique. Consultez le texte et la réécoute, puis corrigez ou recommencez la dictée.',
        );
      }
      setUndo(structuredClone(data));
      setForm((prev) => ({
        ...prev,
        data: applyProposal(prev.data, block, result.data, 'append'),
        review: null,
        voiceWarnings: {
          ...prev.voiceWarnings,
          [block]: [
            ...(json.uncertain || []).map((fragment) => `À réécouter : ${fragment}`),
            ...(result.data.warnings || []),
          ],
        },
      }));
      appliedAudio.current.add(blob);
      setVoiceNotice({ kind: 'success', message: 'Dictée appliquée aux champs.' });
      setStatus(
        'Dictée appliquée : les champs ont été remplis automatiquement. Vérifiez les références et les montants ; vous pouvez corriger les champs ou annuler ce remplissage.',
      );
    } catch (e) {
      if (operation === generation.current) {
        setStatus(e.message);
        setVoiceNotice({ kind: 'error', message: e.message });
      }
    } finally {
      if (operation === generation.current) setBusy('');
    }
  }
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (review) {
      setStatus('Appliquez ou écartez la proposition en attente avant une nouvelle dictée.');
      return;
    }
    if (
      texts[active] &&
      !window.confirm(
        'Remplacer la transcription actuelle ? Les champs déjà saisis seront conservés.',
      )
    )
      return;
    setVoiceNotice(null);
    const id = ++generation.current;
    setBusy('Ouverture du microphone');
    setStatus('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          'Microphone indisponible : utilisez un navigateur récent en HTTPS, ou saisissez la transcription.',
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (id !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = [
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(media, {
        ...(mime ? { mimeType: mime } : {}),
        ...(!mime?.includes('mp4') ? { audioBitsPerSecond: 64000 } : {}),
      });
      recorder.current = rec;
      chunks.current = [];
      size.current = 0;
      voiceBlock.current = active;
      lastBlob.current = null;
      setAudio(null);
      setSeconds(0);
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.current.push(e.data);
          size.current += e.data.size;
          if (size.current > 18 * 1024 * 1024 && rec.state === 'recording') rec.stop();
        }
      };
      rec.onerror = () => {
        setStatus('Enregistrement interrompu. Vérifiez le microphone.');
        if (rec.state === 'recording') rec.stop();
      };
      rec.onstop = () => {
        clearInterval(timer.current);
        media.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (id !== generation.current) return;
        const blob = new Blob(chunks.current, {
          type:
            rec.mimeType ||
            chunks.current.find((chunk) => chunk.type)?.type ||
            mime ||
            'audio/webm',
        });
        if (!blob.size) {
          const message =
            'Aucun audio reçu du microphone. Gardez l’application au premier plan et recommencez.';
          setStatus(message);
          setVoiceNotice({ kind: 'error', message });
          return;
        }
        lastBlob.current = blob;
        setAudio(URL.createObjectURL(blob));
        if (blob.size > 20 * 1024 * 1024) {
          setStatus('Enregistrement trop volumineux : recommencez avec une dictée plus courte.');
          return;
        }
        transcribe(blob, voiceBlock.current);
      };
      // Safari receives a complete MP4 on stop instead of fragmented timeslices.
      if (mime?.includes('mp4')) rec.start();
      else rec.start(1000);
      setRecording(true);
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed++;
        setSeconds(elapsed);
        if (elapsed >= 180 && rec.state === 'recording') rec.stop();
      }, 1000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setStatus(
        e.name === 'NotAllowedError'
          ? 'Microphone refusé. Autorisez-le dans votre navigateur ou saisissez le texte.'
          : e.message,
      );
    } finally {
      setBusy('');
    }
  }
  async function analyzeText() {
    setBusy('Analyse des informations');
    setStatus('');
    try {
      const json = await (
        await request('/api/analyze', { text: texts[active], block: active })
      ).json();
      setForm((prev) => ({
        ...prev,
        review: { block: active, proposal: json.data },
        data: { ...prev.data },
      }));
      setReplace(false);
      setReviewConfirmed(false);
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy('');
    }
  }
  function apply() {
    setUndo(structuredClone(data));
    setForm((prev) => ({
      ...prev,
      data: applyProposal(prev.data, review.block, review.proposal, replace ? 'replace' : 'append'),
      review: null,
    }));
    setStatus('Proposition appliquée. Les contrôles de la fiche restent à terminer.');
    setReviewConfirmed(false);
  }
  async function exportExcel() {
    if (errors.length || review || locked) return;
    setBusy('Préparation du fichier Excel');
    setStatus('');
    try {
      const blob = await (await request('/api/generate-excel', data)).blob();
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download =
        `Provision_${data.vehicle.marque}_${data.vehicle.modele}_${data.vehicle.immat}.xlsx`.replace(
          /[\\/:*?"<>|]/g,
          '-',
        );
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Fichier Excel préparé et téléchargement lancé. Toutes les lignes sont incluses.');
    } catch (e) {
      setStatus(e.message);
    } finally {
      setBusy('');
    }
  }
  function reset() {
    if (
      !window.confirm(
        'Commencer une nouvelle fiche ? Exportez la fiche actuelle avant de la remplacer.',
      )
    )
      return;
    generation.current++;
    abort.current?.abort();
    voiceBlock.current = null;
    appliedAudio.current = new WeakSet();
    setReviewConfirmed(false);
    setReplace(false);
    setBusy('');
    lastBlob.current = null;
    setAudio(null);
    setUndo(null);
    setForm(empty());
    setVoiceNotice(null);
    setStatus('Nouvelle fiche prête.');
  }
  function mechanical(key, value) {
    change((next) => {
      next.mechanics[key] = value;
      const other = {
        vidangeSimple: 'vidangeComplete',
        vidangeComplete: 'vidangeSimple',
        courroie: 'courroiePompe',
        courroiePompe: 'courroie',
      }[key];
      if (other && value === 'OUI') next.mechanics[other] = 'NON';
      return next;
    });
  }

  const voice = active !== 'validation' && (
    <section className="voice card" aria-label="Dictée vocale">
      <div className="voice-content">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SAISIE VOCALE</span>
            <h2>Dictée vocale</h2>
          </div>
          <span className="pill">Remplissage automatique</span>
        </div>
        <p>
          Une information à la fois, avec sa valeur. Épelez les plaques et références ; prononcez
          les euros et les centimes.
        </p>
        <div className="voice-actions" data-recording={recording}>
          <button
            className={recording ? 'voice-record danger' : 'voice-record primary'}
            onClick={record}
            disabled={Boolean(busy || loginNeeded || !health?.speechAvailable)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M8 21h8" />
            </svg>
            {recording ? `Arrêter · ${seconds}s / 180s` : 'Activer la dictée'}
          </button>
          {busy && (
            <button onClick={() => abort.current?.abort()}>Interrompre le traitement</button>
          )}
          <span className="muted">
            {recording ? 'Microphone ouvert — enregistrement en cours' : 'Microphone fermé'}
          </span>
        </div>
        <button
          className="mobile-voice-details"
          aria-expanded={voiceDetails}
          aria-controls="voice-secondary"
          onClick={() => setVoiceDetails((value) => !value)}
        >
          {voiceDetails ? 'Masquer le texte et la réécoute' : 'Texte et réécoute'}
        </button>
        <div id="voice-secondary" className="voice-secondary" data-expanded={voiceDetails}>
          {audio && (
            <div className="playback">
              <audio controls src={audio} aria-label="Réécouter la dernière dictée" />
              <button
                disabled={locked || loginNeeded}
                onClick={() => transcribe(lastBlob.current, voiceBlock.current)}
              >
                Relancer la transcription
              </button>
            </div>
          )}
          <label className="transcript-label" htmlFor="transcript">
            Texte reconnu <span>Vous pouvez aussi saisir votre texte directement</span>
          </label>
          <textarea
            id="transcript"
            rows="3"
            maxLength={18000}
            placeholder="Ex. Réparation du pare-chocs avant, 450 euros et 50 centimes."
            value={texts[active] || ''}
            disabled={locked || Boolean(review)}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, texts: { ...prev.texts, [active]: e.target.value } }))
            }
          />
          <button
            onClick={analyzeText}
            disabled={
              locked ||
              loginNeeded ||
              Boolean(review) ||
              !texts[active]?.trim() ||
              !health?.speechAvailable
            }
          >
            Analyser le texte vérifié →
          </button>
          <details className="privacy">
            <summary>Traitement des données vocales</summary>
            <p>
              L’audio est envoyé au serveur puis à OpenAI pour transcription ; le texte corrigé est
              envoyé à OpenAI pour remplir automatiquement les champs après la dictée, ou lors d’une
              analyse du texte corrigé. Le serveur traite l’audio en mémoire, sans fichier conservé.
              La copie de réécoute reste dans cet onglet jusqu’à son remplacement ou sa fermeture.
              Aucun enregistrement n’est envoyé au service vocal natif du navigateur.
            </p>
          </details>
        </div>
      </div>
    </section>
  );

  return (
    <div className={recording || voiceNotice ? 'app has-voice-dock' : 'app'}>
      <header className="topbar">
        <div className="brand">
          <img src="/logo_ypocamp.jpeg" alt="YpoCamp" />
          <span className="brand-divider" />
          <div>
            <strong>Provision VO</strong>
            <span>Inspection & chiffrage</span>
          </div>
        </div>
        <div className="top-actions">
          {!installed && <button onClick={install}>Installer l’app</button>}
          <span className="save-status">{saveStatus}</span>
          <button disabled={locked || Boolean(review)} onClick={reset}>
            + Nouvelle fiche
          </button>
          {token && (
            <button disabled={locked} onClick={() => setToken('')}>
              Déconnexion
            </button>
          )}
        </div>
      </header>
      <div className="workspace">
        <aside>
          <span className="eyebrow">ESPACE INSPECTION</span>
          <nav aria-label="Étapes de la provision">
            {STEPS.map(([id, label, sub], i) => {
              const complete =
                id === 'validation'
                  ? errors.length === 0
                  : !errors.some(
                      (e) =>
                        e.path.startsWith(
                          id === 'vehicle' ? 'vehicle.' : id === 'mechanics' ? 'mechanics.' : id,
                        ) || e.path === `inspection.${id}`,
                    );
              return (
                <button
                  key={id}
                  disabled={locked}
                  aria-current={active === id ? 'step' : undefined}
                  className={active === id ? 'active' : ''}
                  onClick={() => setForm((prev) => ({ ...prev, active: id }))}
                >
                  <span className={complete ? 'step-number complete' : 'step-number'}>
                    {complete ? '✓' : i + 1}
                  </span>
                  <span>
                    <strong>
                      <span className="desktop-step-label">{label}</span>
                      <span className="mobile-step-label">
                        {['Véhicule', 'Méca', 'Carrosserie', 'Cellule', 'Provision'][i]}
                      </span>
                    </strong>
                    <small>{sub}</small>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="vehicle-summary">
            <span className="eyebrow">VÉHICULE EN COURS</span>
            <strong>
              {[data.vehicle.marque, data.vehicle.modele].filter(Boolean).join(' ') ||
                'Nouvelle inspection'}
            </strong>
            <span>{data.vehicle.immat || 'Immatriculation à renseigner'}</span>
          </div>
          <label className="remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Conserver le brouillon après fermeture sur cet appareil
          </label>
          <p className="small muted">
            À activer uniquement sur un appareil personnel. Sinon, le brouillon est conservé dans
            cet onglet.
          </p>
        </aside>
        <main>
          {installHelp && (
            <section className="card install-help" aria-label="Installer l’application">
              <h2>Provision VO sur votre téléphone</h2>
              <p>
                <strong>iPhone :</strong> ouvrez ce site dans Safari, touchez Partager, puis « Sur
                l’écran d’accueil » et « Ajouter ».
              </p>
              <p>
                <strong>Android :</strong> dans Chrome, ouvrez le menu ⋮ puis « Installer
                l’application » ou « Ajouter à l’écran d’accueil ».
              </p>
              <p>
                La dictée utilise le microphone et Internet. Après une première ouverture en ligne,
                la saisie manuelle reste accessible hors connexion. Dans l’application installée, le
                brouillon est conservé sur cet appareil ; évitez les appareils partagés.
              </p>
              <button onClick={() => setInstallHelp(false)}>Fermer</button>
            </section>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">ÉTAPE {step + 1} SUR 5</span>
              <h1>{STEPS[step][1]}</h1>
              <p>
                {active === 'vehicle'
                  ? 'Identifiez le véhicule et renseignez les conditions d’acquisition.'
                  : active === 'validation'
                    ? 'Tous les montants et contrôles réunis avant export.'
                    : 'Contrôlez chaque poste et chiffrez les travaux nécessaires.'}
              </p>
            </div>
            <span className="page-badge">{data.vehicle.commercial || 'Auteur à renseigner'}</span>
          </div>
          <section className="dossier-overview" aria-label="Véhicule en cours">
            <div className="dossier-identity">
              <span className="eyebrow">FICHE DE PROVISION VO</span>
              <strong>
                {[data.vehicle.marque, data.vehicle.modele].filter(Boolean).join(' ') ||
                  'Nouveau véhicule'}
              </strong>
              <span>{data.vehicle.motorisation || 'Motorisation à renseigner'}</span>
            </div>
            <div className="dossier-metric">
              <span>Immatriculation</span>
              <strong className="plate">{data.vehicle.immat || '—'}</strong>
            </div>
            <div className="dossier-metric">
              <span>Kilométrage</span>
              <strong>{data.vehicle.kilometrage ? `${data.vehicle.kilometrage} km` : '—'}</strong>
            </div>
          </section>
          <div role="status" aria-live="polite" className={status || busy ? 'notice' : 'sr-only'}>
            {busy || status}
          </div>
          {loginNeeded && (
            <form className="card login" onSubmit={login}>
              <h2>Accès équipe</h2>
              <p>
                Connectez-vous pour utiliser la dictée et exporter. Votre saisie reste conservée.
              </p>
              <label htmlFor="password">Mot de passe de l’équipe</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button className="primary" disabled={locked}>
                Se connecter
              </button>
            </form>
          )}
          {!health && (
            <p className="small muted" role="status">
              Connexion aux services vocaux et Excel en cours… Votre saisie reste disponible.
            </p>
          )}
          {voice}
          {review && (
            <section className="card review" aria-label="Proposition de dictée à confirmer">
              <span className="eyebrow">RELECTURE OBLIGATOIRE</span>
              <h2>Vérifiez chaque information proposée</h2>
              <p>
                Rubrique : {STEPS.find(([id]) => id === review.block)?.[1]}. Les champs non
                mentionnés restent inchangés.
              </p>
              {review.proposal.warnings?.length > 0 && (
                <ul className="warnings">
                  {review.proposal.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {Object.entries(review.proposal[review.block] || {}).length === 0 && (
                <p>Aucune information exploitable. Corrigez la transcription.</p>
              )}
              {['vehicle', 'mechanics'].includes(review.block) ? (
                <dl className="proposal-grid">
                  {Object.entries(review.proposal[review.block] || {})
                    .filter(([, v]) => v !== null)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{VEHICLE_LABELS[key] || MECHANICS[key]?.[0] || 'Autres mécanique'}</dt>
                        <dd>
                          <span className="old-value">
                            {data[review.block][key] || 'Non renseigné'}
                          </span>
                          <span> → {String(value)}</span>
                        </dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <ul>
                  {(review.proposal[review.block] || []).map((l, i) => (
                    <li key={i}>
                      {l.desc} —{' '}
                      <strong>
                        {l.amount === null ? 'Montant à préciser' : `${l.amount} € HT`}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
              {['body', 'cell'].includes(review.block) && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                  />
                  Remplacer les travaux existants (sinon, ajouter à la suite)
                </label>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={reviewConfirmed}
                  onChange={(e) => setReviewConfirmed(e.target.checked)}
                />
                J’ai vérifié les références, chiffres et avertissements de cette proposition.
              </label>
              <div className="button-row">
                <button className="primary" disabled={!reviewConfirmed || locked} onClick={apply}>
                  Appliquer les informations relues
                </button>
                <button
                  disabled={locked}
                  onClick={() => {
                    setForm((p) => ({ ...p, review: null }));
                    setReviewConfirmed(false);
                  }}
                >
                  Écarter et corriger le texte
                </button>
              </div>
            </section>
          )}
          {undo && (
            <button
              className="undo"
              disabled={locked}
              onClick={() => {
                setForm((p) => ({ ...p, data: { ...undo } }));
                setUndo(null);
                setStatus('Dernière application de dictée annulée.');
              }}
            >
              ↶ Annuler la dernière application de dictée
            </button>
          )}
          <fieldset className="form-content" disabled={locked}>
            {active === 'vehicle' && (
              <section className="card">
                <div className="section-heading">
                  <h2>Identité du véhicule</h2>
                  <span className="pill">Toutes marques · saisie libre</span>
                </div>
                <p className="small muted">
                  Aucune motorisation n’est complétée automatiquement. Vérifiez la carte grise et
                  les documents du véhicule.
                </p>
                <div className="fields">
                  {Object.entries(VEHICLE_LABELS).map(([key, label]) => (
                    <label className="field" key={key} htmlFor={key}>
                      <span>{label}*</span>
                      <input
                        id={key}
                        type={key === 'mec' ? 'date' : 'text'}
                        maxLength={300}
                        list={
                          key === 'marque'
                            ? 'brands'
                            : key === 'motorisation'
                              ? 'engines'
                              : undefined
                        }
                        inputMode={
                          ['prixAchat', 'cessionOdoo'].includes(key)
                            ? 'decimal'
                            : key === 'kilometrage'
                              ? 'numeric'
                              : undefined
                        }
                        placeholder={
                          key === 'motorisation'
                            ? 'Porteur, cylindrée, puissance, boîte…'
                            : key === 'kilometrage'
                              ? 'Ex. 45000'
                              : ''
                        }
                        value={data.vehicle[key]}
                        onChange={(e) => field(`vehicle.${key}`, e.target.value)}
                      />
                      {fieldError(`vehicle.${key}`) && (
                        <small className="error">{fieldError(`vehicle.${key}`)}</small>
                      )}
                    </label>
                  ))}
                </div>
                <datalist id="brands">
                  {BRANDS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
                <datalist id="engines">
                  {ENGINE_HINTS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </section>
            )}
            {active === 'mechanics' && (
              <section className="card">
                <div className="section-heading">
                  <h2>Contrôles mécaniques</h2>
                  <span className="pill">Forfaits à relire avant export</span>
                </div>
                <p className="small muted">
                  Cliquez sur le bouton pour basculer entre « Oui » et « Non ». « Oui » ajoute le
                  forfait à la provision. Les tarifs proviennent du modèle historique ; vérifiez
                  leur pertinence.
                </p>
                <div className="mechanics-list">
                  {Object.entries(MECHANICS).map(([key, [label, price]]) => (
                    <div className="mechanic" key={key}>
                      <div>
                        <strong>{label}</strong>
                        <span>{money(price * 100)} si prévu</span>
                      </div>
                      <button
                        type="button"
                        className={`mechanic-toggle state-${data.mechanics[key]}`}
                        aria-label={`${label} : ${data.mechanics[key] === 'OUI' ? 'Oui' : 'Non'}`}
                        aria-pressed={data.mechanics[key] === 'OUI'}
                        title="Cliquez pour basculer entre Oui et Non."
                        onClick={() =>
                          mechanical(key, data.mechanics[key] === 'OUI' ? 'NON' : 'OUI')
                        }
                      >
                        {data.mechanics[key] === 'OUI' ? 'OUI' : 'NON'}
                      </button>
                    </div>
                  ))}
                </div>
                <label className="field">
                  <span>Autres travaux mécaniques (€ HT) · vide = 0</span>
                  <input
                    inputMode="decimal"
                    placeholder="0"
                    value={data.mechanics.autresMeca}
                    onChange={(e) => field('mechanics.autresMeca', e.target.value)}
                  />
                </label>
              </section>
            )}
            {['body', 'cell'].includes(active) && (
              <section className="card">
                <div className="section-heading">
                  <h2>Travaux à prévoir</h2>
                  <span className="pill">{data[active].length} ligne(s) · toutes exportées</span>
                </div>
                {active === 'cell' && (
                  <p className="small muted">
                    Points de contrôle suggérés : étanchéité, humidité, chauffage, eau,
                    réfrigérateur, gaz, électricité, batterie cellule et ouvrants.
                  </p>
                )}
                {data[active].length === 0 && (
                  <div className="empty">
                    <strong>Aucun travail saisi</strong>
                    <p>
                      Ajoutez les travaux identifiés. Sans travaux saisis, le montant reste à zéro.
                    </p>
                  </div>
                )}
                {data[active].map((l, i) => (
                  <div className="work-line" key={l.id}>
                    <span className="line-index">{String(i + 1).padStart(2, '0')}</span>
                    <label className="field">
                      <span>Description</span>
                      <input
                        maxLength={1000}
                        value={l.desc}
                        onChange={(e) =>
                          change((n) => {
                            n[active][i].desc = e.target.value;
                            n.inspection[active] = false;
                            return n;
                          })
                        }
                      />
                    </label>
                    <label className="field amount">
                      <span>Montant (€ HT)</span>
                      <input
                        inputMode="decimal"
                        value={l.amount}
                        onChange={(e) =>
                          change((n) => {
                            n[active][i].amount = e.target.value;
                            n.inspection[active] = false;
                            return n;
                          })
                        }
                      />
                    </label>
                    <button
                      aria-label={`Supprimer le travail ${i + 1}`}
                      onClick={() => {
                        if (window.confirm('Supprimer ce travail ?'))
                          change((n) => {
                            n[active].splice(i, 1);
                            n.inspection[active] = false;
                            return n;
                          });
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  disabled={data[active].length >= 200}
                  onClick={() =>
                    change((n) => {
                      n[active].push({ id: makeId(), desc: '', amount: '' });
                      n.inspection[active] = false;
                      return n;
                    })
                  }
                >
                  + Ajouter un travail
                </button>
              </section>
            )}
            {active === 'validation' && (
              <>
                <section className="card">
                  <div className="section-heading">
                    <h2>Forfaits & base de calcul</h2>
                    <span className="pill">Montants HT appliqués à cette fiche</span>
                  </div>
                  <p className="small muted">
                    La cession Odoo est une information distincte : elle n’est pas ajoutée au prix
                    de revient du modèle historique.
                  </p>
                  <div className="fields">
                    {Object.entries({
                      admin: 'Forfait Administratif',
                      pack: 'Pack fraîcheur',
                      humidite: 'Test d’humidité',
                      divers: 'Divers',
                    }).map(([key, label]) => (
                      <label className="field" key={key}>
                        <span>{label} (€ HT)</span>
                        <input
                          inputMode="decimal"
                          value={data.fees[key]}
                          onChange={(e) =>
                            change((n) => {
                              n.fees[key] = e.target.value;
                              return n;
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <p className="small">
                    Mauvaises surprises : 250 € jusqu’à 4 ans inclus, 500 € jusqu’à 8 ans inclus,
                    750 € au-delà. Date complète obligatoire.
                  </p>
                </section>
                <section className="card recap">
                  <h2>Relecture complète</h2>
                  <dl className="proposal-grid">
                    {Object.entries(VEHICLE_LABELS).map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{data.vehicle[key] || 'Non renseigné'}</dd>
                      </div>
                    ))}
                  </dl>
                  <h3>Mécanique</h3>
                  {Object.entries(MECHANICS).map(([key, [label, price]]) => (
                    <div className="recap-line" key={key}>
                      <span>{label}</span>
                      <strong>
                        {data.mechanics[key] === 'OUI'
                          ? money(price * 100)
                          : data.mechanics[key] === 'NON'
                            ? 'Non — contrôlé'
                            : 'Non'}
                      </strong>
                    </div>
                  ))}
                  <div className="recap-line">
                    <span>Autres mécanique</span>
                    <strong>{data.mechanics.autresMeca || '0'} €</strong>
                  </div>
                  {['body', 'cell'].map((block) => (
                    <div key={block}>
                      <h3>{block === 'body' ? 'Carrosserie' : 'Cellule'}</h3>
                      {data[block].length ? (
                        data[block].map((l) => (
                          <div className="recap-line" key={l.id}>
                            <span>{l.desc || 'Description manquante'}</span>
                            <strong>{l.amount || 'À chiffrer'} €</strong>
                          </div>
                        ))
                      ) : (
                        <p>Aucun travail saisi</p>
                      )}
                    </div>
                  ))}
                  <label className="field">
                    <span>Notes et réserves</span>
                    <textarea
                      value={data.notes}
                      maxLength={5000}
                      onChange={(e) =>
                        change((n) => {
                          n.notes = e.target.value;
                          return n;
                        })
                      }
                    />
                  </label>
                </section>
                {(errors.length > 0 || review) && (
                  <section className="card errors" role="alert">
                    <h2>{errors.length} point(s) à vérifier</h2>
                    {review && <p>Une proposition de dictée attend votre décision.</p>}
                    <ul>
                      {errors.map((e, i) => (
                        <li key={i}>
                          <button
                            onClick={() => {
                              const group = e.path.split('.')[0];
                              setForm((p) => ({
                                ...p,
                                active: ['vehicle', 'mechanics', 'body', 'cell'].includes(group)
                                  ? group
                                  : group === 'inspection'
                                    ? e.path.split('.')[1]
                                    : 'validation',
                              }));
                            }}
                          >
                            {e.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </fieldset>
          <div className="bottom-actions">
            <button
              disabled={locked || step === 0}
              onClick={() => setForm((p) => ({ ...p, active: STEPS[step - 1][0] }))}
            >
              ← Précédent
            </button>
            {step < 4 ? (
              <button
                className="primary"
                disabled={locked}
                onClick={() => setForm((p) => ({ ...p, active: STEPS[step + 1][0] }))}
              >
                Continuer →
              </button>
            ) : (
              <button
                className="primary"
                disabled={locked || errors.length > 0 || Boolean(review) || Boolean(loginNeeded)}
                onClick={exportExcel}
              >
                Exporter la fiche Excel ↗
              </button>
            )}
          </div>
        </main>
        <section className="budget" aria-label="Synthèse de la provision">
          <span className="eyebrow">ESTIMATION DE REMISE EN ÉTAT</span>
          <h2>{money(financial.total)}</h2>
          <span className="budget-base">Tous les montants sont HT</span>
          <div className="budget-lines">
            {Object.entries({
              mechanics: 'Mécanique & esthétique',
              body: 'Carrosserie',
              cell: 'Cellule',
              fees: 'Frais & divers',
              surprise: 'Mauvaises surprises',
            }).map(([key, label]) => (
              <div key={key}>
                <span>{label}</span>
                <strong>{financial[key] === null ? 'MEC requise' : money(financial[key])}</strong>
              </div>
            ))}
          </div>
          <div className="budget-total">
            <span>Prix de revient estimé</span>
            <strong>{money(financial.cost)}</strong>
          </div>
          <p className="small">
            Calcul provisoire tant que les contrôles ne sont pas terminés et les montants
            renseignés. Une valeur invalide n’est pas incluse.
          </p>
          <div className={errors.length === 0 && !review ? 'readiness ready' : 'readiness'}>
            {errors.length === 0 && !review
              ? '✓ Prête pour export'
              : `${errors.length + (review ? 1 : 0)} point(s) à vérifier`}
          </div>
        </section>
      </div>
      {(recording || voiceNotice) && (
        <div className="mobile-recording-dock">
          {recording ? (
            <button className="danger" onClick={() => recorder.current?.stop()}>
              <span className="recording-dot" aria-hidden="true" />
              <span>Arrêter la dictée</span>
              <span className="recording-time">
                {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                {String(seconds % 60).padStart(2, '0')}
              </span>
            </button>
          ) : (
            <div className={`voice-feedback ${voiceNotice.kind}`}>
              <p role={voiceNotice.kind === 'error' ? 'alert' : 'status'}>{voiceNotice.message}</p>
              <div className="voice-feedback-actions">
                {voiceNotice.kind === 'error' && lastBlob.current && (
                  <button
                    onClick={() => transcribe(lastBlob.current, voiceBlock.current)}
                    disabled={locked}
                  >
                    Réessayer la dictée
                  </button>
                )}
                {voiceNotice.kind === 'processing' ? (
                  <button onClick={() => abort.current?.abort()}>Interrompre</button>
                ) : (
                  <button onClick={() => setVoiceNotice(null)}>Fermer</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <footer>
        Provision VO · Les références restent fidèles à votre saisie. La dictée remplit les champs
        automatiquement. Vérifiez les références et les montants.
      </footer>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
