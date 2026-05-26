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
  vehicle: Object.fromEntries(Object.keys(vehicleLabels).map(k => [k, ''])),
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

const STATUS = {
  IDLE: '',
  RECORDING: 'Enregistrement en cours…',
  PROCESSING: 'Transcription + analyse GPT en cours…',
  DONE: '',
};

function App() {
  const [active, setActive] = useState('vehicle');
  const [data, setData] = useState(initialState);
  const [texts, setTexts] = useState({ vehicle: '', mechanics: '', body: '', cell: '' });
  const [recording, setRecording] = useState(null);
  const [status, setStatus] = useState('');
  const [phase, setPhase] = useState('idle');

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const stepIndex = STEPS.findIndex(s => s.id === active);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  async function toggleRecord(block) {
    if (recording === block) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mime = [
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
        stream.getTracks().forEach(t => t.stop());

        setRecording(null);
        setPhase('processing');
        setStatus(STATUS.PROCESSING);

        try {
          const blob = new Blob(chunksRef.current, {
            type: rec.mimeType || 'audio/webm',
          });

          const ext =
            blob.type.includes('mp4') ? 'mp4'
            : blob.type.includes('ogg') ? 'ogg'
            : 'webm';

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
          const d = json.data || {};

          setTexts(t => ({
            ...t,
            [block]: transcript,
          }));

          setData(prev => ({
            ...prev,
            vehicle: {
              ...prev.vehicle,
              ...(d.vehicle || {}),
            },
            mechanics: {
              ...prev.mechanics,
              ...(d.mechanics || {}),
            },
            body: d.body && d.body.length ? d.body : prev.body,
            cell: d.cell && d.cell.length ? d.cell : prev.cell,
          }));

          setStatus('');
          setPhase('idle');
        } catch (e) {
          setStatus('Erreur : ' + e.message);
          setPhase('idle');
        }
      };

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
      const res = await fetch(`${API_URL}/api/generate-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error);
      }

      const blob = await res.blob();

      const name = `${data.vehicle.marque}-${data.vehicle.modele}-${data.vehicle.immat}.xlsx`
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = name;
      a.click();

      URL.revokeObjectURL(url);

      setStatus('Fichier téléchargé.');
    } catch (e) {
      setStatus('Erreur : ' + e.message);
    }
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

        {commercial && (
          <div className="topbar-user">
            <div className="user-avatar">{initiale}</div>
            <span className="user-name">{commercial}</span>
          </div>
        )}
      </header>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="layout">
        <aside>
          <p className="nav-label">Saisie</p>

          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={active === s.id ? 'active' : stepIndex > i ? 'done' : ''}
              onClick={() => setActive(s.id)}
            >
              <span className="step-circle">{stepIndex > i ? '✓' : i + 1}</span>
              {s.label}
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
                  {parseInt(data.vehicle.prixAchat).toLocaleString('fr-FR')} €
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
                  {Object.entries(vehicleLabels).map(([k, label]) => (
                    <div key={k} className="field">
                      <label>{label.toUpperCase()}</label>

                      <input
                        type="text"
                        value={data.vehicle[k] || ''}
                        className={data.vehicle[k] ? 'filled' : ''}
                        onChange={e =>
                          setData(d => ({
                            ...d,
                            vehicle: {
                              ...d.vehicle,
                              [k]: e.target.value,
                            },
                          }))
                        }
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
                  {Object.entries(mechanicsLabels).map(([k, label]) => (
                    <div key={k} className="meca-row">
                      <span className="meca-label">{label}</span>

                      <span
                        className={data.mechanics[k] === 'OUI' ? 'badge-oui' : 'badge-non'}
                        onClick={() =>
                          setData(d => ({
                            ...d,
                            mechanics: {
                              ...d.mechanics,
                              [k]: d.mechanics[k] === 'OUI' ? 'NON' : 'OUI',
                            },
                          }))
                        }
                      >
                        {data.mechanics[k] === 'OUI' ? 'OUI' : 'NON'}
                      </span>
                    </div>
                  ))}

                  <div className="meca-row" style={{ gridColumn: 'span 2' }}>
                    <span className="meca-label">Autres méca (€)</span>

                    <input
                      type="number"
                      className="meca-input"
                      value={data.mechanics.autresMeca || '0'}
                      onChange={e =>
                        setData(d => ({
                          ...d,
                          mechanics: {
                            ...d.mechanics,
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
    setData(d => ({
      ...d,
      [block]: [
        ...d[block],
        {
          id: `${Date.now()}-${Math.random()}`,
          desc: '',
          amount: '',
        },
      ],
    }));
  }

  function update(id, field, value) {
    setData(d => ({
      ...d,
      [block]: d[block].map(l =>
        l.id === id
          ? { ...l, [field]: value }
          : l
      ),
    }));
  }

  function remove(id) {
    setData(d => ({
      ...d,
      [block]: d[block].filter(l => l.id !== id),
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

        {lines.map((line, i) => (
          <div className="line-row" key={line.id || i}>
            <span className="line-ref">
              {prefix}{String(i + 1).padStart(2, '0')}
            </span>

            <input
              type="text"
              className="line-desc"
              value={line.desc}
              onChange={e => update(line.id, 'desc', e.target.value)}
              placeholder="Description"
            />

            <input
              type="number"
              className="line-amount"
              value={line.amount}
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

  const oui = Object.entries(mechanicsLabels).filter(([k]) => m[k] === 'OUI');

  return (
    <>
      <div className="card" style={{ borderTop: '2px solid #2563eb' }}>
        <h2>Véhicule</h2>

        <div className="recap-grid">
          {Object.entries(vehicleLabels).map(([k, label]) =>
            v[k] ? (
              <div key={k} className="recap-field">
                <strong>{label}</strong>
                <span>{v[k]}</span>
              </div>
            ) : null
          )}
        </div>
      </div>

      <div className="card" style={{ borderTop: '2px solid #16a34a' }}>
        <h2>Mécanique</h2>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {oui.length === 0 ? (
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>
              Aucun travail mécanique
            </span>
          ) : (
            oui.map(([k, label]) => (
              <span key={k} className="badge-oui">
                {label}
              </span>
            ))
          )}

          {m.autresMeca && m.autresMeca !== '0' && (
            <span className="badge-oui">
              Autres : {m.autresMeca} €
            </span>
          )}
        </div>
      </div>

      {data.body.length > 0 && (
        <div className="card" style={{ borderTop: '2px solid #d97706' }}>
          <h2>Carrosserie</h2>

          {data.body.map((l, i) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '13px',
              }}
            >
              <span style={{ color: '#9ca3af', minWidth: '38px', fontFamily: 'monospace' }}>
                CA{String(i + 1).padStart(2, '0')}
              </span>

              <span style={{ flex: 1 }}>{l.desc}</span>

              {l.amount && (
                <span style={{ fontWeight: 500 }}>
                  {l.amount} €
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {data.cell.length > 0 && (
        <div className="card" style={{ borderTop: '2px solid #7c3aed' }}>
          <h2>Cellule</h2>

          {data.cell.map((l, i) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '13px',
              }}
            >
              <span style={{ color: '#9ca3af', minWidth: '38px', fontFamily: 'monospace' }}>
                CE{String(i + 1).padStart(2, '0')}
              </span>

              <span style={{ flex: 1 }}>{l.desc}</span>

              {l.amount && (
                <span style={{ fontWeight: 500 }}>
                  {l.amount} €
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
