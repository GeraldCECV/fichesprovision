import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const vehicleLabels = {
  marque: 'Marque',
  modèle: 'Modèle',
  motorisation: 'Motorisation',
  mec: 'MEC / 1ère mise en circulation',
  immat: 'Immatriculation',
  prixAchat: 'Prix d'achat €',
  cessionOdoo: 'Cession ODOO €',
  commercial: 'Réalisé par'
};

const mechanicsLabels = {
  prepEsthetique: 'Prépa esthétique',
  ct: 'Contrôle technique',
  vidangeSimple: 'Vidange simple',
  vidangeComplete: 'Vidange complète',
  courroie: 'Courroie distribution',
  pneus: 'Pneus',
  batterie: 'Batterie moteur',
  autresMeca: 'Autres méca €'
};

const initialState = {
  vehicle: Object.fromEntries(Object.keys(vehicleLabels).map((k) => [k, ''])),
  mechanics: {
    prepEsthetique: 'NON', ct: 'NON', vidangeSimple: 'NON',
    vidangeComplete: 'NON', courroie: 'NON', pneus: 'NON',
    batterie: 'NON', autresMeca: '0'
  },
  body: [],
  cell: []
};

function extractLines(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const chunks = raw.split(/[,;\n.]+/).map((s) => s.trim()).filter(Boolean);
  const lines = [];
  let pending = [];
  for (const chunk of chunks) {
    const m = chunk.match(/^(.*?)(\d[\d\s.]*)\s*(euros?|EUR|\u20ac)\s*$/i);
    if (m) {
      if (m[1]) pending.push(m[1].trim().replace(/[,:;-]\s*$/, ''));
      const desc = pending.join(' ').trim();
      if (desc) lines.push({ id: Date.now() + '-' + Math.random(), desc, amount: m[2].replace(/\D/g, '') });
      else if (lines.length) lines[lines.length - 1].amount = m[2].replace(/\D/g, '');
      pending = [];
    } else {
      pending.push(chunk);
    }
  }
  if (pending.length) lines.push({ id: Date.now() + '-' + Math.random(), desc: pending.join(' ').trim(), amount: '' });
  return lines;
}

function App() {
  const [active, setActive] = useState('vehicle');
  const [data, setData] = useState(initialState);
  const [texts, setTexts] = useState({ vehicle: '', mechanics: '', body: '', cell: '' });
  const [recording, setRecording] = useState(null);
  const [status, setStatus] = useState('Pret.');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  async function analyze(block, text) {
    if (!text.trim()) return;
    setStatus('Analyse GPT en cours...');
    try {
      const res = await fetch(API_URL + '/api/analyze-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const json = await res.json();
      if (json.error) { setStatus('Erreur : ' + json.error); return; }
      const d = json.data || {};
      setData(prev => ({
        ...prev,
        vehicle: d.vehicle ? { ...prev.vehicle, ...d.vehicle } : prev.vehicle,
        mechanics: d.mechanics ? { ...prev.mechanics, ...d.mechanics } : prev.mechanics,
        body: (d.body && d.body.length > 0) ? d.body : prev.body,
        cell: (d.cell && d.cell.length > 0) ? d.cell : prev.cell,
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
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        setStatus('Transcription en cours...');
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          const fd = new FormData();
          fd.append('audio', blob, 'audio.' + ext);
          const tr = await fetch(API_URL + '/api/transcribe', { method: 'POST', body: fd });
          const trj = await tr.json();
          if (!tr.ok) throw new Error(trj.error || 'Erreur transcription');
          const transcript = trj.text || '';
          if (block === 'body' || block === 'cell') {
            const lines = extractLines(transcript);
            if (lines.length) setData((d) => ({ ...d, [block]: [...d[block], ...lines] }));
          } else {
            setTexts((t) => ({ ...t, [block]: transcript }));
            await analyze(block, transcript);
          }
          setStatus('');
        } catch (e) { setStatus('Erreur : ' + e.message); }
      };
      recorder.start();
      setRecording(block);
      setStatus('Enregistrement en cours...');
    } catch (e) { setStatus('Erreur micro : ' + e.message); }
  }

  async function generateExcel() {
    setStatus('Génération Excel...');
    try {
      const res = await fetch(API_URL + '/api/generate-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const name = (data.vehicle.marque + '-' + data.vehicle.modele + '-' + data.vehicle.immat + '.xlsx')
        .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setStatus('Fichier téléchargé.');
    } catch (e) { setStatus('Erreur : ' + e.message); }
  }

  const tabs = [
    { id: 'vehicle', label: 'Véhicule' },
    { id: 'mechanics', label: 'Mécanique' },
    { id: 'body', label: 'Carrosserie' },
    { id: 'cell', label: 'Cellule' },
  ];

  return (
    <>
      <header>
        <h1>Génération des fiches de provision VO</h1>
        <p>Groupe Ypo Ouest / Ypocamp</p>
      </header>
      <div className="layout">
        <nav>
          {tabs.map((t) => (
            <button key={t.id} className={active === t.id ? 'active' : ''} onClick={() => setActive(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <main>
          {active === 'vehicle' && (
            <Block title="Caractéristiques Véhicules" block="vehicle" text={texts.vehicle} analyze={analyze} recording={recording} toggleRecord={toggleRecord}>
              <Grid labels={vehicleLabels} values={data.vehicle} onChange={(k, v) => setData((d) => ({ ...d, vehicle: { ...d.vehicle, [k]: v } }))} />
            </Block>
          )}
          {active === 'mechanics' && (
            <Block title="Mécanique" block="mechanics" text={texts.mechanics} analyze={analyze} recording={recording} toggleRecord={toggleRecord}>
              <Grid labels={mechanicsLabels} values={data.mechanics} onChange={(k, v) => setData((d) => ({ ...d, mechanics: { ...d.mechanics, [k]: v } }))} />
            </Block>
          )}
          {active === 'body' && (
            <Lines title="Carrosserie" block="body" recording={recording} toggleRecord={toggleRecord} lines={data.body} setData={setData} />
          )}
          {active === 'cell' && (
            <Lines title="Cellule" block="cell" recording={recording} toggleRecord={toggleRecord} lines={data.cell} setData={setData} />
          )}
          <section className="card">
            <button className="primary" onClick={generateExcel}>Générer le fichier Excel</button>
            <div className="status">{status}</div>
          </section>
        </main>
      </div>
    </>
  );
}

function Block({ title, block, text, analyze, recording, toggleRecord, children }) {
  return (
    <>
      <section className="card">
        <h2>{title}</h2>
        <textarea value={text} onChange={(e) => analyze(block, e.target.value)} placeholder="Texte transcrit..." />
        <button className={"primary" + (recording === block ? " recording" : "")} onClick={() => toggleRecord(block)}>
          {recording === block ? 'Arrêter' : 'Activer la dictée'}
        </button>
        <span className="badge">Analyse automatique</span>
      </section>
      <section className="card">{children}</section>
    </>
  );
}

function Grid({ labels, values, onChange }) {
  return (
    <div className="grid">
      {Object.entries(labels).map(([k, label]) => (
        <div key={k}>
          <label>{label.toUpperCase()}</label>
          <input type="text" value={values[k] || ''} onChange={(e) => onChange(k, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function Lines({ title, block, recording, toggleRecord, lines, setData }) {
  function add() {
    setData((d) => ({ ...d, [block]: [...d[block], { id: Date.now() + '-' + Math.random(), desc: '', amount: '' }] }));
  }
  function update(id, field, value) {
    setData((d) => ({ ...d, [block]: d[block].map((l) => l.id === id ? { ...l, [field]: value } : l) }));
  }
  function remove(id) {
    setData((d) => ({ ...d, [block]: d[block].filter((l) => l.id !== id) }));
  }
  const prefix = title.substring(0, 2).toUpperCase();
  return (
    <>
      <section className="card">
        <h2>{title}</h2>
        <button className={"primary" + (recording === block ? " recording" : "")} onClick={() => toggleRecord(block)}>
          {recording === block ? 'Arrêter' : 'Activer la dictée'}
        </button>
      </section>
      <section className="card">
        {lines.map((line, i) => (
          <div className="line" key={line.id || i}>
            <span>{prefix}{String(i + 1).padStart(2, '0')}</span>
            <input type="text" value={line.desc} onChange={(e) => update(line.id, 'desc', e.target.value)} placeholder="Description" />
            <input type="number" value={line.amount} onChange={(e) => update(line.id, 'amount', e.target.value)} placeholder="Montant" />
            <button onClick={() => remove(line.id)}>x</button>
          </div>
        ))}
        <button className="add-line" onClick={add}>+ Ajouter une ligne</button>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
