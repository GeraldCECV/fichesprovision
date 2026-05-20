import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const vehicleLabels = {
  marque: 'Marque',
  modele: 'ModÃ¨le',
  motorisation: 'Motorisation',
  mec: 'MEC / 1Ã¨re mise en circulation',
  immat: 'Immatriculation',
  prixAchat: "Prix d'achat â¬",
  cessionOdoo: 'Cession ODOO â¬',
  commercial: 'RÃ©alisÃ© par'
};

const mechanicsLabels = {
  prepEsthetique: 'PrÃ©pa esthÃ©tique',
  ct: 'ContrÃ´le technique',
  vidangeSimple: 'Vidange simple',
  vidangeComplete: 'Vidange complÃ¨te',
  courroie: 'Courroie distribution',
  pneus: 'Pneus',
  batterie: 'Batterie moteur',
  autresMeca: 'Autres mÃ©ca â¬'
};

const initialState = {
  vehicle: Object.fromEntries(Object.keys(vehicleLabels).map((k) => [k, ''])),
  mechanics: {
    prepEsthetique: 'NON',
    ct: 'NON',
    vidangeSimple: 'NON',
    vidangeComplete: 'NON',
    courroie: 'NON',
    pneus: 'NON',
    batterie: 'NON',
    autresMeca: '0'
  },
  body: [],
  cell: []
};

function extractLines(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];

  const chunks = raw.split(/[,;\n.]+/).map((s) => s.trim()).filter(Boolean);
  const lines = [];
  let pendingParts = [];

  for (const chunk of chunks) {
    const extracted = extractAmount(chunk);

    if (extracted.amount) {
      if (extracted.desc) pendingParts.push(extracted.desc);

      const desc = pendingParts.join(' ').trim();

      if (desc) {
        lines.push({
          id: `${Date.now()}-${Math.random()}`,
          desc,
          amount: extracted.amount
        });
      } else if (lines.length) {
        lines[lines.length - 1].amount = extracted.amount;
      }

      pendingParts = [];
    } else {
      pendingParts.push(chunk);
    }
  }

  if (pendingParts.length) {
    lines.push({
      id: `${Date.now()}-${Math.random()}`,
      desc: pendingParts.join(' ').trim(),
      amount: ''
    });
  }

  return lines;
}

function extractAmount(text) {
  const original = String(text || '').replace(/\s+/g, ' ').trim();

  const numeric = original.match(/^(.*?)(\d[\d\s.]*)\s*(euros?{â¬)\s*$/i);
  if (numeric) {
    return {
      desc: numeric[1].trim().replace(/[,:;-]\s*$/, ''),
      amount: numeric[2].replace(/\D/g, '')
    };
  }

  if (!/euros?|â¬/i.test(original)) {
    return { desc: original, amount: '' };
  }

  const beforeEuro = original.replace(/euros?|â¬/gi, '').trim();
  const directAmount = frenchNumberToInt(beforeEuro);

  if (directAmount !== null) {
    return { desc: '', amount: String(directAmount) };
  }

  const words = beforeEuro.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const maybeAmount = words.slice(i).join(' ');
    const value = frenchNumberToInt(maybeAmount);

    if (value !== null) {
      return {
        desc: words.slice(0, i).join(' ').trim().replace(/[,:;-]\s*$/, ''),
        amount: String(value)
      };
    }
  }

  return { desc: original, amount: '' };
}

function normalizeNumberText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/-/g, ' ')
    .replace(/\bet\b/g, ' ')
    .replace(/\bd['â]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function frenchNumberToInt(text) {
  const n = normalizeNumberText(text);
  if (!n) return null;
  if (/^\d+$/.test(n)) return Number(n);

  const units = {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
    six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
    treize: 13, quatorze: 14, quinze: 15, seize: 16
  };

  const tens = {
    vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60
  };

  const special = {
    'dix sept': 17, 'dix huit': 18, 'dix neuf': 19,
    'soixante dix': 70, 'soixante onze': 71, 'soixante douze': 72,
    'soixante treize': 73, 'soixante quatorze': 74, 'soixante quinze': 75,
    'soixante seize': 76, 'soixante dix sept': 77, 'soixante dix huit': 78,
    'soixante dix neuf': 79,
    'quatre vingt': 80, 'quatre vingts': 80, 'quatre vingt dix': 90,
    'quatre vingt onze': 91, 'quatre vingt douze': 92, 'quatre vingt treize': 93,
    'quatre vingt quatorze': 94, 'quatre vingt quinze': 95, 'quatre vingt seize': 96,
    'quatre vingt dix sept': 97, 'quatre vingt dix huit': 98, 'quatre vingt dix neuf': 99
  };

  if (special[n] !== undefined) return special[n];
  if (units[n] !== undefined) return units[n];
  if (tens[n] !== undefined) return tens[n];

  const words = n.split(' ');
  let total = 0;
  let current = 0;
  let seen = false;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];

    if (units[w] !== undefined) {
      current += units[w];
      seen = true;
    } else if (tens[w] !== undefined) {
      current += tens[w];
      seen = true;
    } else if (w === 'cent' || w === 'cents') {
      if (current === 0) current = 1;
      current *= 100;
      seen = true;
    } else if (w === 'mille') {
      if (current === 0) current = 1;
      total += current * 1000;
      current = 0;
      seen = true;
    } else {
      const rest = words.slice(i).join(' ');
      if (special[rest] !== undefined) {
        current += special[rest];
        seen = true;
        break;
      }
      return null;
    }
  }

  return seen ? total + current : null;
}


function App() {
  const [active, setActive] = useState('vehicle');
  const [data, setData] = useState(initialState);
  const [texts, setTexts] = useState({ vehicle: '', mechanics: '', body: '', cell: '' });
  const [recording, setRecording] = useState(null);
  const [status, setStatus] = useState('PrÃªt.');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timers = useRef({});

  async function analyze(block, text) {
    if (!text.trim()) return;
    setStatus('Analyse GPT en cours...');
    try {
      const res = await fetch(`${API_URL}/api/analyze-full`, {
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

  function addDictatedLine(block, transcript) {
    const lines = extractLines(transcript);
    if (!lines.length) return;
    setData((d) => ({ ...d, [block]: [...d[block], ...lines] }));
  }

  async function toggleRecord(block) {
    if (recording === block) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(null);
        setStatus('Transcription en coursâ¦');

        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const ext = blob.type.includes('mp4') ? 'mp4'
            : blob.type.includes('ogg') ? 'ogg'
            : blob.type.includes('wav') ? 'wav'
            : 'webm';

          const formData = new FormData();
          formData.append('audio', blob, `audio.${ext}`);

          const trRes = await fetch(`${API_URL}/api/transcribe`, {
            method: 'POST',
            body: formData
          });
          const trJson = await trRes.json();
          if (!trRes.ok) throw new Error(trJson.error || 'Erreur transcription');

          const transcript = trJson.text || '';

          if (block === 'body' || block === 'cell') {
            addDictatedLine(block, transcript);
          } else {
            setTexts((t) => ({ ...t, [block]: transcript }));
            await analyze(block, transcript);
          }

          setStatus('');
        } catch (e) {
          setStatus('Erreur : ' + e.message);
        }
      };

      recorder.start();
      setRecording(block);
      setStatus('Enregistrement en coursâ¦');
    } catch (e) {
      setStatus('Erreur micro : ' + e.message);
    }
  }

  async function generateExcel() {
    setStatus('GÃ©nÃ©ration du fichier Excelâ¦');
    try {
      const res = await fetch(`${API_URL}/api/generate-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur gÃ©nÃ©ration');
      }

      const blob = await res.blob();
      const name = `${data.vehicle.marque}-${data.vehicle.modele}-${data.vehicle.immat}.xlsx`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Fichier tÃ©lÃ©chargÃ©.');
    } catch (e) {
      setStatus('Erreur : ' + e.message);
    }
  }

  return (
    <>
      <div>
        <h1>GÃ©nÃ©ration des fiches de provision VO</h1>
        <p>Groupe Ypo Ouest / Ypocamp</p>
      </div>
      <div className="layout">
        <nav>
          {['vehicle', 'mechanics', 'body', 'cell'].map((b) => (
            <button
              key={b}
              className={active === b ? 'active' : ''}
              onClick={() => setActive(b)}
            >
              {b === 'vehicle' ? 'VÃ©hicule' : b === 'mechanics' ? 'MÃ©canique' : b === 'body' ? 'Carrosserie' : 'Cellule'}
            </button>
          ))}
        </nav>
        <main>
          {active === 'vehicle' && <Block title="CaractÃ©ristiques VÃ©hicules" block="vehicle" text={texts.vehicle} analyze={analyze} recording={recording} toggleRecord={toggleRecord}><Grid labels={vehicleLabels} values={data.vehicle} onChange={(k, v) => setData((d) => ({ ...d, vehicle: { ...d.vehicle, [k]: v } }))} /></Block>}
          {active === 'mechanics' && <Block title="MÃ©canique" block="mechanics" text={texts.mechanics} analyze={analyze} recording={recording} toggleRecord={toggleRecord}><Grid labels={mechanicsLabels} values={data.mechanics} onChange={(k, v) => setData((d) => ({ ...d, mechanics: { ...d.mechanics, [k]: v } }))} /></Block>}
          {active === 'body' && <Lines title="Carrosserie" block="body" text={texts.body} recording={recording} toggleRecord={toggleRecord} lines={data.body} setData={setData} help="DictÃ©e continue : la ligne change automatiquement aprÃ¨s chaque montant." />}
          {active === 'cell' && <Lines title="Cellule" block="cell" text={texts.cell} recording={recording} toggleRecord={toggleRecord} lines={data.cell} setData={setData} help="DictÃ©e continue : la ligne change automatiquement aprÃ¨s chaque montant." />}
          <section className="card">
            <button className="primary" onClick={generateExcel}>GÃ©nÃ©rer le fichier Excel</button>
          </section>
          <div className="status">{status}</div>
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
        <textarea
          value={text}
          onChange={(e) => analyze(block, e.target.value)}
          placeholder="Texte transcrit..."
        />
        <button className="primary" onClick={() => toggleRecord(block)}>
          {recording === block ? 'â  ArrÃªter' : 'ð¡ Activer la dictÃ©e'}
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
          <input
            type="text"
            value={values[k] || ''}
            onChange={(e) => onChange(k, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function Lines({ title, block, text, recording, toggleRecord, lines, setData, help }) {
  function add() {
    setData((d) => ({ ...d, [block]: [...d[block], { id: `${Date.now()}-${Math.random()}`, desc: '', amount: '' }] }));
  }
  function update(id, field, value) {
    setData((d) => ({ ...d, [block]: d[block].map((l) => l.id === id ? { ...l, [field]: value } : l) }));
  }
  function remove(id) {
    setData((d) => ({ ...d, [block]: d[block].filter((l) => l.id !== id) }));
  }
  function filenameFromHeader(t) {
    return String(t || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  }
  return (
    <>
      <section className="card">
        <h2>{title}</h2>
        {help && <p className="help">{help}</p>}
        <textarea value={text} readOnly placeholder="Transcription accumulÃ©e..." />
        <button className="primary" onClick={() => toggleRecord(block)}>
          {recording === block ? 'â  ArrÃªter' : 'ð¡ Activer la dictÃ©e'}
        </button>
      </section>
      <section className="card">
          {lines.map((line, i) => (
            <div className="line" key={line.id || i}>
              <span>{filenameFromHeader(title)}{String(i + 1).padStart(2, '0')}</span>
              <input type="text" value={line.desc} onChange={(e) => update(line.id, 'desc', e.target.value)} placeholder="Description" />
              <input type="number" value={line.amount} onChange={(e) => update(line.id, 'amount', e.target.value)} placeholder="Montant" />
              <button onClick={() => remove(line.id)}>æ¶</button>
            </div>
          ))}
        <button onClick={add}>+ Ajouter ligne</button>
      </section>
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
