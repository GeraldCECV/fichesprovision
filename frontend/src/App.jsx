import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const STEPS = [
  { id: 'vehicle', label: 'Véhicule' },
  { id: 'mechanics', label: 'Mécanique' },
  { id: 'body', label: 'Carrosserie' },
  { id: 'cell', label: 'Cellule' },
  { id: 'validation', label: 'Validation' },
];

const vehicleLabels = {
  marque: 'Marque',
  modele: 'Modèle',
  motorisation: 'Motorisation',
  mec: 'MEC / 1ère mise en circulation',
  immat: 'Immatriculation',
  prixAchat: "Prix d'achat €",
  cessionOdoo: 'Cession Odoo €',
  commercial: 'Réalisé par',
};

const mechanicsLabels = {
  prepEsthetique: 'Prépa esthétique',
  ct: 'Contrôle technique',
  vidangeSimple: 'Vidange simple',
  vidangeComplete: 'Vidange complète',
  courroie: 'Courroie distribution',
  pneus: 'Pneus',
  batterie: 'Batterie moteur',
};

const initialState = {
  vehicle: Object.fromEntries(
    Object.keys(vehicleLabels).map(k => [k, ''])
  ),

  mechanics: {
    prepEsthetique: 'NON',
    ct: 'NON',
    vidangeSimple: 'NON',
    vidangeComplete: 'NON',
    courroie: 'NON',
    pneus: 'NON',
    batterie: 'NON',
    autresMeca: '0',
  },

  body: [],
  cell: [],
};

function capitalizeFirst(str) {
  const value = String(str || '').trim();

  if (!value) return '';

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractLines(text) {
  const raw = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return [];

  const chunks = raw
    .split(/[,;\n.]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const lines = [];
  let pending = [];

  for (const chunk of chunks) {
    const match = chunk.match(
      /^(.*?)(\d[\d\s.]*)\s*(euros?|eur|€)?$/i
    );

    if (match && match[2]) {
      const descPart = match[1]
        .trim()
        .replace(/[,:;-]\s*$/, '');

      const amount = match[2].replace(/\D/g, '');

      if (descPart) {
        pending.push(descPart);
      }

      const desc = capitalizeFirst(
        pending.join(' ').trim()
      );

      if (desc) {
        lines.push({
          id: `${Date.now()}-${Math.random()}`,
          desc,
          amount,
        });
      }

      pending = [];
    } else {
      pending.push(chunk);
    }
  }

  if (pending.length) {
    lines.push({
      id: `${Date.now()}-${Math.random()}`,
      desc: capitalizeFirst(
        pending.join(' ').trim()
      ),
      amount: '',
    });
  }

  return lines;
}

const STATUS = {
  IDLE: '',
  RECORDING: 'Enregistrement en cours…',
  PROCESSING: 'Transcription + analyse GPT…',
};

function App() {
  const [active, setActive] = useState('vehicle');
  const [data, setData] = useState(initialState);

  const [texts, setTexts] = useState({
    vehicle: '',
    mechanics: '',
    body: '',
    cell: '',
  });

  const [recording, setRecording] = useState(null);
  const [status, setStatus] = useState('');
  const [phase, setPhase] = useState('idle');

  const recorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const chunksRef = useRef([]);

  const stepIndex = STEPS.findIndex(
    s => s.id === active
  );

  const progress =
    (stepIndex / (STEPS.length - 1)) * 100;

  async function toggleRecord(block) {
    if (recording === block) {
      recorderRef.current?.stop();
      recognitionRef.current?.stop();
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      const mime = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find(t =>
        MediaRecorder.isTypeSupported(t)
      ) || '';

      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );

      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = e => {
        if (e.data.size) {
          chunksRef.current.push(e.data);
        }
      };

      rec.onstop = async () => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;

        stream.getTracks().forEach(t => t.stop());

        setRecording(null);
        setPhase('processing');
        setStatus(STATUS.PROCESSING);

        try {
          const blob = new Blob(
            chunksRef.current,
            {
              type: rec.mimeType || 'audio/webm',
            }
          );

          const ext =
            blob.type.includes('mp4')
              ? 'mp4'
              : blob.type.includes('ogg')
              ? 'ogg'
              : 'webm';

          const fd = new FormData();

          fd.append(
            'audio',
            blob,
            `audio.${ext}`
          );

          const response = await fetch(
            `${API_URL}/api/transcribe-and-analyze`,
            {
              method: 'POST',
              body: fd,
            }
          );

          const json = await response.json();

          if (!response.ok) {
            throw new Error(
              json.error ||
                'Erreur transcription/analyse'
            );
          }

          const transcript = json.text || '';
          const d = json.data || {};

          const parsedLines =
            extractLines(transcript);

          setTexts(t => ({
            ...t,
            [block]: transcript,
          }));

          setData(prev => ({
            ...prev,

            vehicle: {
              ...prev.vehicle,
              ...(block === 'vehicle'
                ? d.vehicle || {}
                : {}),
            },

            mechanics: {
              ...prev.mechanics,
              ...(block === 'mechanics'
                ? d.mechanics || {}
                : {}),
            },

            body:
              block === 'body'
                ? parsedLines
                : d.body?.length
                ? d.body
                : prev.body,

            cell:
              block === 'cell'
                ? parsedLines
                : d.cell?.length
                ? d.cell
                : prev.cell,
          }));

          setStatus('');
          setPhase('idle');
        } catch (e) {
          setStatus(
            'Erreur : ' + e.message
          );

          setPhase('idle');
        }
      };

      // LIVE TRANSCRIPTION
      const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition =
          new SpeechRecognition();

        recognition.lang = 'fr-FR';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = event => {
          let liveTranscript = '';

          for (
            let i = 0;
            i < event.results.length;
            i++
          ) {
            liveTranscript +=
              event.results[i][0].transcript +
              ' ';
          }

          setTexts(t => ({
            ...t,
            [block]:
              liveTranscript.trim(),
          }));
        };

        recognition.onerror = () => {};

        recognition.start();

        recognitionRef.current =
          recognition;
      }

      rec.start();

      setRecording(block);
      setPhase('recording');
      setStatus(STATUS.RECORDING);
    } catch (e) {
      setStatus(
        'Erreur micro : ' + e.message
      );

      setPhase('idle');
    }
  }

  async function generateExcel() {
    setStatus('Génération du fichier…');

    try {
      const res = await fetch(
        `${API_URL}/api/generate-excel`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }

      const blob = await res.blob();

      const name =
        `${data.vehicle.marque}-${data.vehicle.modele}-${data.vehicle.immat}.xlsx`
          .replace(/[\\/:*?"<>|]+/g, '-')
          .replace(/\s+/g, ' ')
          .trim();

      const url =
        URL.createObjectURL(blob);

      const a =
        document.createElement('a');

      a.href = url;
      a.download = name;
      a.click();

      URL.revokeObjectURL(url);

      setStatus(
        'Fichier téléchargé.'
      );
    } catch (e) {
      setStatus(
        'Erreur : ' + e.message
      );
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <img
            src="/logo_ypocamp.jpeg"
            alt="Ypocamp"
            className="logo"
          />

          <span className="topbar-sep">
            /
          </span>

          <span className="topbar-title">
            Provision VO
          </span>
        </div>
      </header>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      <div className="layout">
        <aside>
          <p className="nav-label">
            Saisie
          </p>

          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={
                active === s.id
                  ? 'active'
                  : stepIndex > i
                  ? 'done'
                  : ''
              }
              onClick={() =>
                setActive(s.id)
              }
            >
              <span className="step-circle">
                {stepIndex > i
                  ? '✓'
                  : i + 1}
              </span>

              {s.label}
            </button>
          ))}
        </aside>

        <main>
          <div className="card">
            <div className="dictee-inner">
              <span className="dictee-title">
                Dictée vocale
              </span>

              {recording && (
                <span className="dictee-badge">
                  Dictée live…
                </span>
              )}
            </div>

            {texts[active] && (
              <p className="transcript">
                {texts[active]}
              </p>
            )}

            <button
              className={`btn-mic${
                recording
                  ? ' recording'
                  : ''
              }`}
              onClick={() =>
                toggleRecord(active)
              }
            >
              {recording
                ? '⏹ Arrêter'
                : '🎙 Activer la dictée'}
            </button>
          </div>

          {status && (
            <p className="status">
              {status}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

createRoot(
  document.getElementById('root')
).render(<App />);
