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
  mec: '1ère MEC',
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
  batterie: 'Batterie moteur',
};

const initialState = {
  vehicle: Object.fromEntries(Object.keys(vehicleLabels).map(k => [k, ''])),
  mechanics: {
    prepEsthetique: 'NON',
    ct: 'NON',
    vidangeSimple: 'NON',
    vidangeComplete: 'NON',
    courroie: 'NON',
    pneusAvant: 'NON',
    pneusArriere: 'NON',
    pneus: '0',
    batterie: 'NON',
    autresMeca: '0',
  },
  body: [],
  cell: [],
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Formate l'immatriculation au format SIV français : AB-123-CD
function formatImmatFront(value) {
  const raw = String(value || '').toUpperCase().replace(/[\s\-]/g, '');
  const siv = raw.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  if (siv) return `${siv[1]}-${siv[2]}-${siv[3]}`;
  return value; // retourner la valeur brute si format non reconnu (saisie en cours)
}

function capitalizeFirst(str) {
  const value = String(str || '').trim();
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function computePneus(avant, arriere) {
  const a = avant === 'OUI';
  const b = arriere === 'OUI';

  if (a && b) return '2';
  if (a || b) return '1';
  return '0';
}

function extractLines(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  const chunks = raw
    .split(/[,;\n.]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const lines = [];
  let pending = [];

  for (const chunk of chunks) {
    const match = chunk.match(/^(.*?)(\d[\d\s.]*)\s*(euros?|eur|€)?$/i);

    if (match && match[2]) {
      const descPart = match[1].trim().replace(/[,:;-]\s*$/, '');
      const amount = match[2].replace(/\D/g, '');

      if (descPart) pending.push(descPart);

      const desc = capitalizeFirst(pending.join(' ').trim());

      if (desc) {
        lines.push({
          id: makeId(),
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
      id: makeId(),
      desc: capitalizeFirst(pending.join(' ').trim()),
      amount: '',
    });
  }

  return lines;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines)) return [];

  return lines
    .map(line => ({
      id: line.id || makeId(),
      desc: capitalizeFirst(line.desc || line.description || ''),
      amount: String(line.amount || line.montant || '').replace(/\D/g, ''),
    }))
    .filter(line => line.desc || line.amount);
}

function normalizeMechanics(mechanics = {}) {
  const pneusAvant = mechanics.pneusAvant === 'OUI' ? 'OUI' : 'NON';
  const pneusArriere = mechanics.pneusArriere === 'OUI' ? 'OUI' : 'NON';

  return {
    prepEsthetique: mechanics.prepEsthetique === 'OUI' ? 'OUI' : 'NON',
    ct: mechanics.ct === 'OUI' ? 'OUI' : 'NON',
    vidangeSimple: mechanics.vidangeSimple === 'OUI' ? 'OUI' : 'NON',
    vidangeComplete: mechanics.vidangeComplete === 'OUI' ? 'OUI' : 'NON',
    courroie: mechanics.courroie === 'OUI' ? 'OUI' : 'NON',
    pneusAvant,
    pneusArriere,
    pneus: computePneus(pneusAvant, pneusArriere),
    batterie: mechanics.batterie === 'OUI' ? 'OUI' : 'NON',
    autresMeca: mechanics.autresMeca ?? '0',
  };
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

  const stepIndex = STEPS.findIndex(s => s.id === active);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  async function toggleRecord(block) {
    if (recording === block) {
      recorderRef.current?.stop();
      recognitionRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mime =
        [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/ogg;codecs=opus',
        ].find(t => MediaRecorder.isTypeSupported(t)) || '';

      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = e => {
        if (e.data.size) chunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        try {
          recognitionRef.current?.stop();
        } catch (_) {}

        recognitionRef.current = null;
        stream.getTracks().forEach(t => t.stop());

        setRecording(null);
        setPhase('processing');
        setStatus(STATUS.PROCESSING);

        try {
          const blob = new Blob(chunksRef.current, {
            type: rec.mimeType || 'audio/webm',
          });

          const ext =
            blob.type.includes('mp4') ? 'mp4' :
            blob.type.includes('ogg') ? 'ogg' :
            'webm';

          const fd = new FormData();
          fd.append('audio', blob, `audio.${ext}`);

          const response = await fetch(`${API_URL}/api/transcribe-and-analyze`, {
            method: 'POST',
            body: fd,
          });

          const json = await response.json();

          if (!response.ok) {
            throw new Error(json.error || 'Erreur transcription/analyse');
          }

          const transcript = json.text || '';
          const result = json.data || {};
          const parsedLines = (block === 'body' || block === 'cell')
            ? normalizeLines(extractLines(transcript))
            : [];

          setTexts(prev => ({
            ...prev,
            [block]: transcript,
          }));

          setData(prev => {
            const newMechanics =
              block === 'mechanics'
                ? normalizeMechanics({
                    ...prev.mechanics,
                    ...(result.mechanics || {}),
                  })
                : prev.mechanics;

            return {
              ...prev,
              vehicle: {
                ...prev.vehicle,
                ...(block === 'vehicle' ? result.vehicle || {} : {}),
              },
              mechanics: newMechanics,
              body: block === 'body' ? parsedLines : prev.body,
              cell: block === 'cell' ? parsedLines : prev.cell,
            };
          });

          setStatus('');
          setPhase('idle');
        } catch (e) {
          setStatus('Erreur : ' + e.message);
          setPhase('idle');
        }
      };

      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();

          recognition.lang = 'fr-FR';
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = event => {
            let liveTranscript = '';

            for (let i = 0; i < event.results.length; i++) {
              liveTranscript += event.results[i][0].transcript + ' ';
            }

            setTexts(prev => ({
              ...prev,
              [block]: liveTranscript.trim(),
            }));
          };

          recognition.onerror = () => {};
          recognitionRef.current = recognition;
          recognition.start();
        } catch (_) {
          recognitionRef.current = null;
        }
      }

      rec.start();

      setRecording(block);
      setPhase('recording');
      setStatus(STATUS.RECORDING);
    } catch (e) {
      setStatus('Erreur micro : ' + e.message);
      setPhase('idle');
    }
  }

  async function generateExcel() {
    setStatus('Génération du fichier…');

    try {
      const response = await fetch(`${API_URL}/api/generate-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur génération Excel');
      }

      const blob = await response.blob();

      const name = `${data.vehicle.marque}-${data.vehicle.modele}-${data.vehicle.immat}.xlsx`
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = name || 'Fiche_Provision.xlsx';
      a.click();

      URL.revokeObjectURL(url);
      setStatus('Fichier téléchargé.');
    } catch (e) {
      setStatus('Erreur : ' + e.message);
    }
  }


  function resetForm() {
    setActive('vehicle');
    setData(initialState);
    setTexts({ vehicle: '', mechanics: '', body: '', cell: '' });
    setStatus('');
    setPhase('idle');
  }

  const commercial = data.vehicle.commercial || '';
  const initiale = commercial ? commercial.trim()[0].toUpperCase() : '';
  const vehicleName = [data.vehicle.marque, data.vehicle.modele].filter(Boolean).join(' ');

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <img src="/logo_ypocamp.jpeg" alt="Ypocamp" className="logo" />
          <span className="topbar-sep">/</span>
          <span className="topbar-title">Provision VO</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-sub">Nouvelle fiche</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {commercial && (
            <div className="topbar-user">
              <div className="user-avatar">{initiale}</div>
              <span className="user-name">{commercial}</span>
            </div>
          )}
          <button className="btn-new-fiche" onClick={resetForm}>
            + Nouvelle fiche
          </button>
        </div>
      </header>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="layout">
        <aside>
          <p className="nav-label">Saisie</p>

          {STEPS.map((step, index) => (
            <button
              key={step.id}
              className={active === step.id ? 'active' : stepIndex > index ? 'done' : ''}
              onClick={() => setActive(step.id)}
            >
              <span className="step-circle">{stepIndex > index ? '✓' : index + 1}</span>
              {step.label}
            </button>
          ))}

          {vehicleName && (
            <div className="sidebar-summary">
              <p className="sidebar-summary-label">En cours</p>
              <p className="sidebar-summary-name">{vehicleName}</p>

              {data.vehicle.immat && (
                <p className="sidebar-summary-detail">{data.vehicle.immat}</p>
              )}

              {data.vehicle.prixAchat && (
                <p className="sidebar-summary-detail">
                  {parseInt(data.vehicle.prixAchat, 10).toLocaleString('fr-FR')} €
                </p>
              )}
            </div>
          )}
        </aside>

        <main>
          {active === 'vehicle' && (
            <>
              <p className="page-title">Caractéristiques véhicule</p>
              <p className="page-sub">Dictez ou saisissez les informations du véhicule</p>

              <DicteeBlock
                block="vehicle"
                text={texts.vehicle}
                recording={recording}
                phase={phase}
                onRecord={toggleRecord}
              />

              <div className="card">
                <div className="grid">
                  {Object.entries(vehicleLabels).map(([key, label]) => (
                    <div key={key} className="field">
                      <label>{label.toUpperCase()}</label>

                      <input
                        type="text"
                        value={data.vehicle[key] || ''}
                        className={data.vehicle[key] ? 'filled' : ''}
                        onChange={e => {
                          const val = key === 'immat'
                            ? formatImmatFront(e.target.value)
                            : e.target.value;
                          setData(prev => ({
                            ...prev,
                            vehicle: {
                              ...prev.vehicle,
                              [key]: val,
                            },
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {active === 'mechanics' && (
            <>
              <p className="page-title">Mécanique</p>
              <p className="page-sub">Dictez les travaux mécaniques à effectuer</p>

              <DicteeBlock
                block="mechanics"
                text={texts.mechanics}
                recording={recording}
                phase={phase}
                onRecord={toggleRecord}
              />

              <div className="card">
                <div className="meca-grid">
                  {Object.entries(mechanicsLabels).map(([key, label]) => (
                    <div key={key} className="meca-row">
                      <span className="meca-label">{label}</span>

                      <span
                        className={data.mechanics[key] === 'OUI' ? 'badge-oui' : 'badge-non'}
                        onClick={() =>
                          setData(prev => ({
                            ...prev,
                            mechanics: {
                              ...prev.mechanics,
                              [key]: prev.mechanics[key] === 'OUI' ? 'NON' : 'OUI',
                            },
                          }))
                        }
                      >
                        {data.mechanics[key] === 'OUI' ? 'OUI' : 'NON'}
                      </span>
                    </div>
                  ))}

                  <div className="meca-row">
                    <span className="meca-label">Pneus</span>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className={
                          data.mechanics.pneusAvant !== 'OUI' &&
                          data.mechanics.pneusArriere !== 'OUI'
                            ? 'badge-oui'
                            : 'badge-non'
                        }
                        onClick={() =>
                          setData(prev => ({
                            ...prev,
                            mechanics: {
                              ...prev.mechanics,
                              pneusAvant: 'NON',
                              pneusArriere: 'NON',
                              pneus: '0',
                            },
                          }))
                        }
                      >
                        NON
                      </button>

                      <button
                        type="button"
                        className={data.mechanics.pneusAvant === 'OUI' ? 'badge-oui' : 'badge-non'}
                        onClick={() =>
                          setData(prev => {
                            const pneusAvant = prev.mechanics.pneusAvant === 'OUI' ? 'NON' : 'OUI';
                            const pneusArriere = prev.mechanics.pneusArriere;
                            const pneus = computePneus(pneusAvant, pneusArriere);

                            return {
                              ...prev,
                              mechanics: {
                                ...prev.mechanics,
                                pneusAvant,
                                pneus,
                              },
                            };
                          })
                        }
                      >
                        AVANT
                      </button>

                      <button
                        type="button"
                        className={data.mechanics.pneusArriere === 'OUI' ? 'badge-oui' : 'badge-non'}
                        onClick={() =>
                          setData(prev => {
                            const pneusAvant = prev.mechanics.pneusAvant;
                            const pneusArriere = prev.mechanics.pneusArriere === 'OUI' ? 'NON' : 'OUI';
                            const pneus = computePneus(pneusAvant, pneusArriere);

                            return {
                              ...prev,
                              mechanics: {
                                ...prev.mechanics,
                                pneusArriere,
                                pneus,
                              },
                            };
                          })
                        }
                      >
                        ARRIÈRE
                      </button>
                    </div>
                  </div>

                  <div className="meca-row" style={{ gridColumn: 'span 2' }}>
                    <span className="meca-label">Autres méca (€)</span>

                    <input
                      type="number"
                      className="meca-input"
                      value={data.mechanics.autresMeca || '0'}
                      onChange={e =>
                        setData(prev => ({
                          ...prev,
                          mechanics: {
                            ...prev.mechanics,
                            autresMeca: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {active === 'body' && (
            <>
              <p className="page-title">Carrosserie</p>
              <p className="page-sub">Dictez les travaux de carrosserie ligne par ligne</p>

              <LinesBlock
                block="body"
                text={texts.body}
                prefix="CA"
                recording={recording}
                phase={phase}
                onRecord={toggleRecord}
                lines={data.body}
                setData={setData}
              />
            </>
          )}

          {active === 'cell' && (
            <>
              <p className="page-title">Cellule</p>
              <p className="page-sub">Dictez les travaux sur la cellule ligne par ligne</p>

              <LinesBlock
                block="cell"
                text={texts.cell}
                prefix="CE"
                recording={recording}
                phase={phase}
                onRecord={toggleRecord}
                lines={data.cell}
                setData={setData}
              />
            </>
          )}

          {active === 'validation' && (
            <>
              <p className="page-title">Validation finale</p>
              <p className="page-sub">Vérifiez les informations avant de générer le fichier Excel</p>

              <RecapCard
                data={data}
                vehicleLabels={vehicleLabels}
                mechanicsLabels={mechanicsLabels}
              />
            </>
          )}

          <div className="actions">
            <div className="nav-btns">
              {stepIndex > 0 && (
                <button
                  className="btn-secondary"
                  onClick={() => setActive(STEPS[stepIndex - 1].id)}
                >
                  ← Précédent
                </button>
              )}

              {stepIndex < STEPS.length - 1 && (
                <button
                  className="btn-primary"
                  onClick={() => setActive(STEPS[stepIndex + 1].id)}
                >
                  {STEPS[stepIndex + 1].label} →
                </button>
              )}
            </div>

            {active === 'validation' && (
              <button className="btn-excel" onClick={generateExcel}>
                Générer le fichier Excel
              </button>
            )}

            {status && (
              <p className={`status${phase === 'processing' ? ' status-pulse' : ''}`}>
                {status}
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function DicteeBlock({ block, text, recording, phase, onRecord }) {
  const isRecording = recording === block;
  const isProcessing = phase === 'processing' && !isRecording;

  return (
    <div className="card">
      <div className="dictee-inner">
        <span className="dictee-title">Dictée vocale</span>

        {!isRecording && !isProcessing && (
          <span className="dictee-badge">Transcription + analyse auto</span>
        )}

        {/* Point 6 : animation ondes pendant l'enregistrement */}
        {isRecording && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="dictee-badge recording-badge">Enregistrement…</span>
            <div className="dictee-waves">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="dictee-wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
        )}

        {isProcessing && (
          <span className="dictee-badge-analyzing">Transcription + analyse…</span>
        )}
      </div>

      {text && <p className="transcript">{text}</p>}

      <button
        className={`btn-mic${isRecording ? ' recording' : ''}`}
        onClick={() => onRecord(block)}
        disabled={phase !== 'idle' && phase !== 'recording'}
      >
        {isRecording ? '⏹ Arrêter' : '🎙 Activer la dictée'}
      </button>
    </div>
  );
}

function LinesBlock({ block, text, prefix, recording, phase, onRecord, lines, setData }) {
  function add() {
    setData(prev => ({
      ...prev,
      [block]: [
        ...prev[block],
        {
          id: makeId(),
          desc: '',
          amount: '',
        },
      ],
    }));
  }

  function update(id, field, value) {
    setData(prev => ({
      ...prev,
      [block]: prev[block].map(line =>
        line.id === id
          ? {
              ...line,
              [field]: field === 'desc' ? capitalizeFirst(value) : value,
            }
          : line
      ),
    }));
  }

  function remove(id) {
    setData(prev => ({
      ...prev,
      [block]: prev[block].filter(line => line.id !== id),
    }));
  }

  return (
    <>
      <DicteeBlock
        block={block}
        text={text}
        recording={recording}
        phase={phase}
        onRecord={onRecord}
      />

      <div className="card">
        {lines.length === 0 && (
          <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>
            Aucune ligne -- dictez ou ajoutez manuellement.
          </p>
        )}

        {lines.map((line, index) => (
          <div className="line-row" key={line.id || index}>
            <span className="line-ref">
              {prefix}
              {String(index + 1).padStart(2, '0')}
            </span>

            <input
              type="text"
              className="line-desc"
              value={line.desc || ''}
              onChange={e => update(line.id, 'desc', e.target.value)}
              placeholder="Description"
            />

            <input
              type="number"
              className="line-amount"
              value={line.amount || ''}
              onChange={e => update(line.id, 'amount', e.target.value)}
              placeholder="0 €"
            />

            <button className="btn-del" onClick={() => remove(line.id)}>
              ✕
            </button>
          </div>
        ))}

        <button className="btn-add" onClick={add}>
          + Ajouter une ligne
        </button>
      </div>
    </>
  );
}

function RecapCard({ data, vehicleLabels, mechanicsLabels }) {
  const v = data.vehicle;
  const m = data.mechanics;

  const oui = Object.entries(mechanicsLabels).filter(([key]) => m[key] === 'OUI');

  const bodyLines = normalizeLines(data.body);
  const cellLines = normalizeLines(data.cell);

  return (
    <>
      <div className="card" style={{ borderTop: '2px solid #2563eb' }}>
        <h2>Véhicule</h2>

        <div className="recap-grid">
          {Object.entries(vehicleLabels).map(([key, label]) =>
            v[key] ? (
              <div key={key} className="recap-field">
                <strong>{label}</strong>
                <span>{v[key]}</span>
              </div>
            ) : null
          )}
        </div>
      </div>

      <div className="card" style={{ borderTop: '2px solid #16a34a' }}>
        <h2>Mécanique</h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {oui.length === 0 && m.pneus === '0' ? (
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>
              Aucun travail mécanique
            </span>
          ) : (
            <>
              {oui.map(([key, label]) => (
                <span key={key} className="badge-oui">
                  {label}
                </span>
              ))}

              {m.pneus !== '0' && (
                <span className="badge-oui">
                  Pneus : {m.pneusAvant === 'OUI' ? 'avant' : ''}
                  {m.pneusAvant === 'OUI' && m.pneusArriere === 'OUI' ? ' + ' : ''}
                  {m.pneusArriere === 'OUI' ? 'arrière' : ''}
                </span>
              )}
            </>
          )}

          {m.autresMeca && m.autresMeca !== '0' && (
            <span className="badge-oui">Autres : {m.autresMeca} €</span>
          )}
        </div>
      </div>

      {bodyLines.length > 0 && (
        <div className="card" style={{ borderTop: '2px solid #d97706' }}>
          <h2>Carrosserie</h2>

          {bodyLines.map((line, index) => (
            <div
              key={line.id || index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '6px 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '13px',
              }}
            >
              <span style={{ color: '#9ca3af', minWidth: '42px', fontFamily: 'monospace' }}>
                CA{String(index + 1).padStart(2, '0')}
              </span>

              <span style={{ flex: 1 }}>{line.desc}</span>

              {line.amount && (
                <span style={{ fontWeight: 600 }}>{line.amount} €</span>
              )}
            </div>
          ))}
        </div>
      )}

      {cellLines.length > 0 && (
        <div className="card" style={{ borderTop: '2px solid #7c3aed' }}>
          <h2>Cellule</h2>

          {cellLines.map((line, index) => (
            <div
              key={line.id || index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '6px 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '13px',
              }}
            >
              <span style={{ color: '#9ca3af', minWidth: '42px', fontFamily: 'monospace' }}>
                CE{String(index + 1).padStart(2, '0')}
              </span>

              <span style={{ flex: 1 }}>{line.desc}</span>

              {line.amount && (
                <span style={{ fontWeight: 600 }}>{line.amount} €</span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
