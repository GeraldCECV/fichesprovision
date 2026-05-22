import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const STEPS = [
  { id: 'vehicle',    label: 'V\u00e9hicule',     icon: '\uD83D\uDDC5' },
  { id: 'mechanics',  label: 'M\u00e9canique',    icon: '\uD83D\uDD27' },
  { id: 'body',       label: 'Carrosserie',  icon: '\uD83D\uDD17' },
  { id: 'cell',       label: 'Cellule',      icon: '\uD83C\uDF00' },
  { id: 'validation', label: 'Validation',   icon: '\u2705' },
];

const vehicleLabels = {
  marque:       'Marque',
  modele:        'Mod\u00e8le',
  motorisation:  'Motorisation',
  mec:           'MEC / 1\u00e8re mise en circulation',
  immat:         'Immatriculation',
  prixAchat:     "Prix d\u2019achat \u20AC",
  cessionOdoo:   'Cession Odoo \u20AC',
  commercial:    'R\u00e9alis\u00e9 par',
};

const mechanicsLabels = {
  prepEsthetique: 'Pr\u00e9pa esth\u00e9tique',
  ct:             'Contr\u00f4le technique',
  vidangeSimple:  'Vidange simple',
  vidangeComplete:'Vidange compl\u00e8te',
  courroie:       'Courroie distribution',
  pneus:          'Pneus',
  batterie:       'Batterie moteur',
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
    } else { pending.push(chunk); }
  }
  if (pending.length) lines.push({ id: `${Date.now()}-${Math.random()}`, desc: pending.join(' ').trim(), amount: '' });
  return lines;
}

function App() {
  const [active, setActive] = useState('vehicle');
  const [data, setData]     = useState(initialState);
  const [texts, setTexts]   = useState({ vehicle: '', mechanics: '', body: '', cell: '' });
  const [recording, setRecording] = useState(null);
  const [status, setStatus] = useState('');
  const recorderRef = useRef(null);
  const chunksRef   = useRef([]);
  const stepIndex = STEPS.findIndex(s => s.id === active);

  async function analyze(block, text) {
    if (!text.trim()) return;
    setStatus('Analyse en cours\u2026');
    try {
      const res = await fetch(`${API_URL}/api/analyze-full`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (json.error) { setStatus('Erreur : ' + json.error); return; }
      const d = json.data || {};
      const nonEmpty = obj => obj ? Object.fromEntries(
        Object.entries(obj).filter(([_v, v]) => v !== null && v !== undefined && String(v).trim() !== '' && v !== '0')
      ) : {};
      setData(prev => ({
        ...prev,
        vehicle:   { ...prev.vehicle,   ...nonEmpty(d.vehicle)   },
        mechanics: { ...prev.mechanics, ...nonEmpty(d.mechanics) },
        body: d.body && d.body.length ? d.body : prev.body,
        cell: d.cell && d.cell.length ? d.cell : prev.cell,
      }));
      setStatus('');
    } catch (e) { setStatus('Erreur : ' + e.message); }
  }

  async function toggleRecord(block) {
    if (recording === block) { recorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus']
                     .find(t => MediaRecorder.isTypeSupported(t)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(null); setStatus('Transcription\u2026');
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          const fd = new FormData();
          fd.append('audio', blob, `audio.${ext}`);
          const tr = await fetch(`${API_URL}/api/transcribe`, { method: 'POST', body: fd });
          const trj = await tr.json();
          if (!tr.ok) throw new Error(trj.error || 'Erreur transcription');
          const transcript = trj.text || '';
          setTexts(t => ({ ...t, [block]: transcript }));
          if (block === 'body' || block === 'cell') {
            const nl = extractLines(transcript);
            if (nl.length) setData(d => ({ ...d, [block]: [...d[block], ...nl] }));
            setStatus('');
          } else { await analyze(block, transcript); }
        } catch (e) { setStatus('Erreur : ' + e.message); }
      };
      rec.start(); setRecording(block); setStatus('Enregistrement\u2026');
    } catch (e) { setStatus('Erreur micro : ' + e.message); }
  }

  async function generateExcel() {
    setStatus('G\u00e9n\u00e9ration du fichier\u2026');
    try {
      const res = await fetch(`${API_URL}/api/generate-excel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const name = `${data.vehicle.marque}-${data.vehicle.modele}-${data.vehicle.immat}.xlsx`
        .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setStatus('Fichier t\u00e9l\u00e9charg\u00e9.');
    } catch (e) { setStatus('Erreur : ' + e.message); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header>
        <img src="/logo_ypocamp.jpeg" alt="Ypocamp" />
        <div className="header-sep" />
        <h1>G\u00e9n\u00e9ration des fiches de provision VO</h1>
      </header>
      <div className="layout">
        <aside>
          <p className="nav-label">Saisie</p>
          {STEPS.map((s, i) => (
            <button key={s.id}
              className={active === s.id ? 'active' : stepIndex > i ? 'done' : ''}
              onClick={() => setActive(s.id)}>
              <span className="step-num">{stepIndex > i ? '\u2713' : i + 1}</span>
              {s.label}
            </button>
          ))}
        </aside>
        <main>
          {active === 'vehicle' && (<>
            <p className="page-title">Caract\u00e9ristiques v\u00e9hicule</p>
            <p className="page-sub">Dictez ou saisissez les informations du v\u00e9hicule</p>
            <DicteeBlock block="vehicle" text={texts.vehicle} recording={recording} onRecord={toggleRecord} />
            <div className="card"><div className="grid">
              {Object.entries(vehicleLabels).map(([k, label]) => (
                <div key={k} className="field">
                  <label>{label.toUpperCase()}</label>
                  <input type="text" value={data.vehicle[k] || ''}
                    onChange={e => setData(d => ({ ...d, vehicle: { ...d.vehicle, [k]: e.target.value } }))} />
                </div>))}
            </div></div></>)}
          {active === 'mechanics' && (<>
            <p className="page-title">M\u00e9canique</p>
            <p className="page-sub">Dictez les travaux m\u00e9caniques \u00e0 effectuer</p>
            <DicteeBlock block="mechanics" text={texts.mechanics} recording={recording} onRecord={toggleRecord} />
            <div className="card"><div className="meca-grid">
              {Object.entries(mechanicsLabels).map(([k, label]) => (
                <div key={k} className="meca-row">
                  <span className="meca-label">{label}</span>
                  <span className={data.mechanics[k] === 'OUI' ? 'badge-oui' : 'badge-non'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setData(d => ({ ...d, mechanics: { ...d.mechanics, [k]: d.mechanics[k] === 'OUI' ? 'NON' : 'OUI' } }))}>
                    {data.mechanics[k] === 'OUI' ? 'OUI' : 'NON'}
                  </span>
                </div>))}
              <div className="meca-row" style={{ gridColumn: 'span 2' }}>
                <span className="meca-label">Autres m\u00e9ca (\u20AC)</span>
                <input type="number" className="meca-input"
                  value={data.mechanics.autresMeca || '0'}
                  onChange={e => setData(d => ({ ...d, mechanics: { ...d.mechanics, autresMeca: e.target.value } }))} />
              </div>
            </div></div></>)}
          {active === 'body' && (<>
            <p className="page-title">Carrosserie</p>
            <p className="page-sub">Dictez les travaux de carrosserie ligne par ligne</p>
            <LinesBlock block="body" text={texts.body} prefix="CA" recording={recording} onRecord={toggleRecord} lines={data.body} setData={setData} />
          </>)}
          {active === 'cell' && (<>
            <p className="page-title">Cellule</p>
            <p className="page-sub">Dictez les travaux sur la cellule ligne par ligne</p>
            <LinesBlock block="cell" text={texts.cell} prefix="CE" recording={recording} onRecord={toggleRecord} lines={data.cell} setData={setData} />
          </>)}
          {active === 'validation' && (<>
            <p className="page-title">Validation finale</p>
            <p className="page-sub">V\u00e9rifiez les informations avant de g\u00e9n\u00e9rer le fichier Excel</p>
            <RecapCard data={data} vehicleLabels={vehicleLabels} mechanicsLabels={mechanicsLabels} />
          </>)}
          <div className="actions">
            <div className="nav-btns">
              {stepIndex > 0 && <button className="btn-secondary" onClick={() => setActive(STEPS[stepIndex - 1].id)}>\u2190 Pr\u00e9c\u00e9dent</button>}
              {stepIndex < STEPS.length - 1 && <button className="btn-primary" onClick={() => setActive(STEPS[stepIndex + 1].id)}>Suivant \u2192</button>}
            </div>
            {active === 'validation' && <button className="btn-excel" onClick={generateExcel}>G\u00e9n\u00e9rer le fichier Excel</button>}
            {status && <p className="status">{status}</p>}
          </div>
        </main>
      </div>
    </div>
  );
}

function DicteeBlock({ block, text, recording, onRecord }) {
  return (
    <div className="card dictee-card">
      <div className="dictee-header">
        <button className={`btn-mic${recording === block ? ' recording' : ''}`} onClick={() => onRecord(block)}>
          {recording === block ? '\u23f9 Arr\u00eater' : '\ud83c\udf19\ufe0f Activer la dict\u00e9e'}
        </button>
        {recording !== block && <span className="badge">Analyse automatique GPT</span>}
      </div>
      {text && <p className="transcript">{text}</p>}
    </div>
  );
}

function LinesBlock({ block, text, prefix, recording, onRecord, lines, setData }) {
  function add() { setData(d => ({ ...d, [block]: [...d[block], { id: `${Date.now()}-${Math.random()}`, desc: '', amount: '' }] })); }
  function update(id, field, value) { setData(d => ({ ...d, [block]: d[block].map(l => l.id === id ? { ...l, [field]: value } : l) })); }
  function remove(id) { setData(d => ({ ...d, [block]: d[block].filter(l => l.id !== id) })); }
  return (
    <>
      <DicteeBlock block={block} text={text} recording={recording} onRecord={onRecord} />
      <div className="card">
        {lines.length === 0 && <p style={{ fontSize: '13px', color: 'var(--text-faint)', marginBottom: '10px' }}>Aucune ligne \u2014 dictez ou ajoutez manuellement.</p>}
        {lines.map((line, i) => (
          <div className="line-row" key={line.id || i}>
            <span className="line-ref">{prefix}{String(i+1).padStart(2,'0')}</span>
            <input type="text" className="line-desc" value={line.desc}
              onChange={e => update(line.id, 'desc', e.target.value)} placeholder="Description" />
            <input type="number" className="line-amount" value={line.amount}
              onChange={e => update(line.id, 'amount', e.target.value)} placeholder="0 \u20AC" />
            <button className="btn-del" onClick={() => remove(line.id)}>\u2315</button>
          </div>))}
        <button className="btn-add" onClick={add}>+ Ajouter une ligne</button>
      </div>
    </>
  );
}

function RecapCard({ data, vehicleLabels, mechanicsLabels }) {
  const v = data.vehicle;
  const m = data.mechanics;
  const oui = Object.entries(mechanicsLabels).filter(([k]) => m[k] === 'OUI');
  return (<>
    <div className="card" style={{ borderTop: '3px solid #2563eb' }}>
      <h2><span className="card-icon">\ud83d\uddc5</span> V\u00e9hicule</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
        {Object.entries(vehicleLabels).map(([k,label]) => v[k] ? (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize:'11px', fontWeight:600, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--text-faint)' }}>{label}</span>
            <span style={{ fontSize:'13.5px', color:'var(--text)', fontWeight:500 }}>{v[k]}</span>
          </div>) : null)}
      </div>
    </div>
    <div className="card" style={{ borderTop: '3px solid #16a34a' }}>
      <h2><span className="card-icon" style={{ background:'#f0fdf4', color:'#16a34a' }}>\ud83d\udd27</span> M\u00e9canique</h2>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
        {oui.length === 0 ? <span style={{ fontSize:'13px', color:'var(--text-faint)' }}>Aucun travail m\u00e9canique</span>
          : oui.map(([k,label]) => <span key={k} className="badge-oui">{label}</span>)}
        {m.autresMeca && m.autresMeca !== '0' && <span className="badge-oui">Autres : {m.autresMeca} \u20AC</span>}
      </div>
    </div>
    {data.body.length > 0 && <div className="card" style={{ borderTop:'3px solid #d97706' }}>
      <h2><span className="card-icon" style={{ background:'#fffbeb', color:'#d97706' }}>\ud83d\udd17</span> Carrosserie</h2>
      {data.body.map((l,i) => <div key={l.id} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:'13.5px' }}>
        <span style={{ color:'var(--text-faint)', minWidth:'40px', fontFamily:'monospace' }}>CA{String(i+1).padStart(2,'0')}</span>
        <span style={{ flex:1 }}>{l.desc}</span>
        {l.amount && <span style={{ fontWeight:600 }}>{l.amount} \u20AC</span>}
      </div>)}
    </div>}
    {data.cell.length > 0 && <div className="card" style={{ borderTop:'3xx solid #7c3aed' }}>
      <h2><span className="card-icon" style={{ background:'#f5f3ff', color:'#7c3aed' }}>\ud83c\udf00</span> Cellule</h2>
      {data.cell.map((l,i) => <div key={l.id} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border)', fontSize:'13.5px' }}>
        <span style={{ color:'var(--text-faint)', minWidth:'40px', fontFamily:'monospace' }}>CE{String(i+1).padStart(2,'0')}</span>
        <span style={{ flex:1 }}>{l.desc}</span>
        {l.amount && <span style={{ fontWeight:600 }}>{l.amount} \u20AC</span>}
      </div>)}
    </div>}
  </>);
}

createRoot(document.getElementById('root')).render(<App />);
