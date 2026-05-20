import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const STEPS = [
  { id: 'vehicle',   label: 'Véhicule' },
  { id: 'mechanics', label: 'Mécanique' },
  { id: 'body',      label: 'Carrosserie' },
  { id: 'cell',      label: 'Cellule' },
];

const vehicleLabels = {
  marque:        'Marque',
  modele:        'Modèle',
  motorisation:  'Motorisation',
  mec:           'MEC / 1ère mise en circulation',
  immat:         'Immatriculation',
  prixAchat:     "Prix d’achat €",
  cessionOdoo:   'Cession Odoo €',
  commercial:    'Réalisé par',
};

const mechanicsLabels = {
  prepEsthetique: 'Prépa esthétique',
  ct:             'Contrôle technique',
  vidangeSimple:  'Vidange simple',
  vidangeComplete:'Vidange complète',
  courroie:       'Courroie distribution',
  pneus:          'Pneus',
  batterie:       'Batterie moteur',
  autresMeca:     'Autres méca \u20AC',
};

const initialState = {
  vehicle: Object.fromEntries(Object.keys(vehicleLabels).map(k => [k, ''])),
  mechanics: {
    prepEsthetique: 'NON', ct: 'NON', vidangeSimple: 'NON',
    vidangeComplete: 'NON', courroie: 'NON', pneus: 'NON',
    batterie: 'NON', autresMeca: '0',
  },
  body: [],
  cell: [],
};

function extractLines(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const chunks = raw.split(/[,;\n.]+/).map(s => s.trim()).filter(Boolean);
  const lines = [];
  let pending = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^(.*?)(\d[\d\s.]*)[\s]*(euros?|EUR|\u20AC)\s*$/i);
    if (m) {
      if (m[1]) pending.push(m[1].trim().replace(/[,:;-]\s*$/, ''));
      const desc = pending.join(' ').trim();
      const amount = m[2].replace(/\D/g, '');
      if (desc) lines.push({ id: `${Date.now()}-${Math.random()}`, desc, amount });
      else if (lines.length) lines[lines.length - 1].amount = amount;
      pending = [];
    } else {
      pending.push(chunk);
    }
  }
  if (pending.length) lines.push({ id: `${Date.now()}-${Math.random()}`, desc: pending.join(' ').trim(), amount: '' });
  return lines;
}

function App() {
  const [step, setStep]         = useState(0);
  const [data, setData]         = useState(initialState);
  const [texts, setTexts]       = useState({ vehicle: '', mechanics: '', body: '', cell: '' });
  const [recording, setRecording] = useState(null);
  const [status, setStatus]     = useState('');
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);

  async function analyze(block, text) {
    if (!text.trim()) return;
    setStatus('Analyse en cours\u2026');
    try {
      const res  = await fetch(`${API_URL}/api/analyze-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (json.error) { setStatus('Erreur : ' + json.error); return; }
      const d = json.data || {};
      setData(prev => ({
        ...prev,
        vehicle:   d.vehicle   ? { ...prev.vehicle,   ...d.vehicle   } : prev.vehicle,
        mechanics: d.mechanics ? { ...prev.mechanics, ...d.mechanics } : prev.mechanics,
        body:      d.body  && d.body.length  ? d.body  : prev.body,
        cell:      d.cell  && d.cell.length  ? d.cell  : prev.cell,
      }));
      setStatus('');
    } catch (e) {
      setStatus('Erreur : ' + e.message);
    }
  }

  async function toggleRecord(block) {
    if (recording === block) { recorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime   = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus']
                       .find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec    = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current   = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(null);
        setStatus('Transcription\u2026');
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          const ext  = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          const fd   = new FormData();
          fd.append('audio', blob, `audio.${ext}`);
          const tr  = await fetch(`${API_URL}/api/transcribe`, { method: 'POST', body: fd });
          const trj = await tr.json();
          if (!tr.ok) throw new Error(trj.error || 'Erreur transcription');
          const transcript = trj.text || '';
          setTexts(t => ({ ...t, [block]: transcript }));
          if (block === 'body' || block === 'cell') {
            const newLines = extractLines(transcript);
            if (newLines.length) setData(d => ({ ...d, [block]: [...d[block], ...newLines] }));
            setStatus('');
          } else {
            await analyze(block, transcript);
          }
        } catch (e) { setStatus('Erreur : ' + e.message); }
      };
      rec.start();
      setRecording(block);
      setStatus('Enregistrement\u2026');
    } catch (e) { setStatus('Erreur micro : ' + e.message); }
  }

  async function generateExcel() {
    setStatus('Génération du fichier\u2026');
    try {
      const res = await fetch(`${API_URL}/api/generate-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const name = `${data.vehicle.marque}-${data.vehicle.modele}-${data.vehicle.immat}.xlsx`
        .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setStatus('Fichier téléchargé.');
    } catch (e) { setStatus('Erreur : ' + e.message); }
  }

  const activeId = STEPS[step].id;

  return (
    <div className="app">

      {/* ── TOPBAR ── */}
      <header className="topbar">
        <img src="/logo_ypocamp.jpeg" alt="Ypocamp" className="logo" />
        <div className="topbar-title">
          <h1>Génération des fiches de provision VO</h1>
          <span>Groupe Ypo Ouest</span>
        </div>
      </header>

      {/* ── STEPPER ── */}
      <nav className="stepper">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <button
              className={`step${step === i ? ' active' : ''}${step > i ? ' done' : ''}`}
              onClick={() => setStep(i)}
            >
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="step-arrow">&rsaquo;</span>}
          </React.Fragment>
        ))}
      </nav>

      {/* ── CONTENU ── */}
      <main className="content">

        {activeId === 'vehicle' && (
          <>
            <DicteeBlock
              title="Caractéristiques Véhicules"
              block="vehicle"
              text={texts.vehicle}
              recording={recording}
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
                      onChange={e => setData(d => ({ ...d, vehicle: { ...d.vehicle, [k]: e.target.value } }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeId === 'mechanics' && (
          <>
            <DicteeBlock
              title="Mécanique"
              block="mechanics"
              text={texts.mechanics}
              recording={recording}
              onRecord={toggleRecord}
            />
            <div className="card">
              <div className="grid">
                {Object.entries(mechanicsLabels).map(([k, label]) => (
                  <div key={k} className="field">
                    <label>{label.toUpperCase()}</label>
                    <input
                      type="text"
                      value={data.mechanics[k] || ''}
                      onChange={e => setData(d => ({ ...d, mechanics: { ...d.mechanics, [k]: e.target.value } }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeId === 'body' && (
          <LinesBlock
            title="Carrosserie"
            block="body"
            text={texts.body}
            recording={recording}
            onRecord={toggleRecord}
            lines={data.body}
            setData={setData}
          />
        )}

        {activeId === 'cell' && (
          <LinesBlock
            title="Cellule"
            block="cell"
            text={texts.cell}
            recording={recording}
            onRecord={toggleRecord}
            lines={data.cell}
            setData={setData}
          />
        )}

        {/* ── NAVIGATION + EXCEL ── */}
        <div className="actions">
          <div className="nav-btns">
            {step > 0 && (
              <button className="btn-secondary" onClick={() => setStep(step - 1)}>
                &lsaquo; Précédent
              </button>
            )}
            {step < STEPS.length - 1 && (
              <button className="btn-primary" onClick={() => setStep(step + 1)}>
                Suivant &rsaquo;
              </button>
            )}
          </div>
          {step === STEPS.length - 1 && (
            <button className="btn-excel" onClick={generateExcel}>
              📥 Générer le fichier Excel
            </button>
          )}
          {status && <p className="status">{status}</p>}
        </div>

      </main>
    </div>
  );
}

function DicteeBlock({ title, block, text, recording, onRecord }) {
  return (
    <div className="card dictee-card">
      <div className="dictee-header">
        <h2>{title}</h2>
        <button
          className={`btn-mic${recording === block ? ' recording' : ''}`}
          onClick={() => onRecord(block)}
        >
          {recording === block ? '⏹ Arrêter' : '🎙 Activer la dictée'}
        </button>
        {recording !== block && <span className="badge">Analyse automatique</span>}
      </div>
      {text && <p className="transcript">{text}</p>}
    </div>
  );
}

function LinesBlock({ title, block, text, recording, onRecord, lines, setData }) {
  const prefix = title.slice(0, 2).toUpperCase();

  function add() {
    setData(d => ({ ...d, [block]: [...d[block], { id: `${Date.now()}-${Math.random()}`, desc: '', amount: '' }] }));
  }
  function update(id, field, value) {
    setData(d => ({ ...d, [block]: d[block].map(l => l.id === id ? { ...l, [field]: value } : l) }));
  }
  function remove(id) {
    setData(d => ({ ...d, [block]: d[block].filter(l => l.id !== id) }));
  }

  return (
    <>
      <DicteeBlock title={title} block={block} text={text} recording={recording} onRecord={onRecord} />
      <div className="card">
        {lines.map((line, i) => (
          <div className="line-row" key={line.id || i}>
            <span className="line-ref">{prefix}{String(i + 1).padStart(2, '0')}</span>
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
              placeholder="Montant"
            />
            <button className="btn-del" onClick={() => remove(line.id)}>✕</button>
          </div>
        ))}
        <button className="btn-add" onClick={add}>+ Ajouter une ligne</button>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
