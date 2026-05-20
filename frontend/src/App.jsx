import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const vehicleLabels = {
  marque: 'Marque',
  modele: 'Modèle',
  motorisation: 'Motorisation',
  mec: 'MEC / 1ère mise en circulation',
  immat: 'Immatriculation',
  prixAchat: "Prix d'achat €",
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

  const numeric = original.match(/^(.*?)(\d[\d\s.]*)\s*(euros?|€)\s*$/i);
  if (numeric) {
    return {
      desc: numeric[1].trim().replace(/[,:;-]\s*$/, ''),
      amount: numeric[2].replace(/\D/g, '')
    };
  }

  if (!/euros?|€/i.test(original)) {
    return { desc: original, amount: '' };
  }

  const beforeEuro = original.replace(/euros?|€/gi, '').trim();
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
    .replace(/\bd['’]/g, ' ')
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
  const [status, setStatus] = useState('Prêt.');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timers = useRef({});

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
        setStatus('Transcription en cours…');

        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          const ext = blob.type.includes('mp4') ? 'mp4'
            : blob.type.includes('ogg') ? 'ogg'
            : blob.type.includes('wav') ? 'wav'
            : 'webm';

          const form = new FormData();
          form.append('audio', blob, `audio.${ext}`);

          const res = await fetch(`${API_URL}/api/transcribe`, { method: 'POST', body: form });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Erreur transcription');

          const transcript = json.text || '';

          if (block === 'body' || block === 'cell') {
            addDictatedLine(block, transcript);
        await analyze(block, transcript);
          } else {
            const next = `${texts[block] ? `${texts[block]}\n` : ''}${transcript}`;
            analyze(block, next);
            setStatus('Transcription terminée.');
          }
        } catch (error) {
          setStatus(error.message);
        }
      };

      recorder.start();
      setRecording(block);
      setStatus('Enregistrement en cours… Clique sur Arrêter à la fin de la phrase.');
    } catch (error) {
      setStatus(`Micro indisponible : ${error.message}`);
    }
  }

  async function generateExcel() {
    setStatus('Génération Excel en cours…');

    try {
      const res = await fetch(`${API_URL}/api/generate-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur génération Excel');
      }

      const blob = await res.blob();
      const v = data.vehicle;
      const name = `${v.marque}-${v.modele}-${v.immat}.xlsx`.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Fichier Excel généré.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  const summary = useMemo(() => {
    const v = data.vehicle;
    const m = data.mechanics;

    return `🚐 CARACTÉRISTIQUES VÉHICULES
Marque / Modèle : ${v.marque} ${v.modele}
Motorisation : ${v.motorisation}
Immatriculation : ${v.immat}
MEC : ${v.mec}
Prix d'achat : ${v.prixAchat} €
Cession ODOO : ${v.cessionOdoo} €
Réalisé par : ${v.commercial}

🔧 MÉCANIQUE
${Object.entries(mechanicsLabels).map(([k, label]) => m[k] && m[k] !== 'NON' && m[k] !== '0' ? `- ${label} : ${m[k]}` : '').filter(Boolean).join('\n')}

🎨 CARROSSERIE
${data.body.map((l) => `- ${l.desc} : ${l.amount} €`).join('\n')}

🏠 CELLULE
${data.cell.map((l) => `- ${l.desc} : ${l.amount} €`).join('\n')}

📦 DIVERS
- Pack Fraicheur
- Test d'humidité`;
  }, [data]);

  return (
    <>
      <header>
        <img src="/logo_ypocamp.jpeg" />
        <div>
          <h1>Génération des fiches de provision VO</h1>
        </div>
      </header>

      <div className="layout">
        <aside>
          <button className={active === 'vehicle' ? 'active' : ''} onClick={() => setActive('vehicle')}>1. Caractéristiques Véhicules</button>
          <button className={active === 'mechanics' ? 'active' : ''} onClick={() => setActive('mechanics')}>2. Mécanique</button>
          <button className={active === 'body' ? 'active' : ''} onClick={() => setActive('body')}>3. Carrosserie</button>
          <button className={active === 'cell' ? 'active' : ''} onClick={() => setActive('cell')}>4. Cellule</button>
          <button className={active === 'validation' ? 'active' : ''} onClick={() => setActive('validation')}>5. Validation</button>
        </aside>

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
            <Lines
              title="Carrosserie"
              block="body"
              text={texts.body}
              recording={recording}
              toggleRecord={toggleRecord}
              lines={data.body}
              setData={setData}
              help="Dictée continue : la ligne change automatiquement après chaque montant."
            />
          )}

          {active === 'cell' && (
            <Lines
              title="Cellule"
              block="cell"
              text={texts.cell}
              recording={recording}
              toggleRecord={toggleRecord}
              lines={data.cell}
              setData={setData}
              help="Dictée continue : la ligne change automatiquement après chaque montant."
            />
          )}

          {active === 'validation' && (
            <section className="card">
              <h2>Validation finale</h2>
              <pre>{summary}</pre>
              <button className="primary" onClick={generateExcel}>✅ Générer le fichier Excel</button>
            </section>
          )}

            
      <section className="card">{children}</section>
    </>
  );
}

function Grid({ labels, values, onChange }) {
  return (
    <div className="grid">
      {Object.entries(labels).map(([k, label]) => (
        <label key={k}>
          <span>{label}</span>
          <input value={values[k] || ''} onChange={(e) => onChange(k, e.target.value)} />
        </label>
      ))}
    </div>
  );
}

function Lines({ title, block, text, recording, toggleRecord, lines, setData, help }) {
  function add() {
    setData((d) => ({ ...d, [block]: [...d[block], { id: String(Date.now()), desc: '', amount: '' }] }));
  }

  function update(index, key, value) {
    setData((d) => ({ ...d, [block]: d[block].map((line, i) => i === index ? { ...line, [key]: value } : line) }));
  }

  function remove(index) {
    setData((d) => ({ ...d, [block]: d[block].filter((_, i) => i !== index) }));
  }

  return (
    <>
      <section className="card">
        <h2>{title}</h2>
        <p className="help">{help}</p>
        <textarea readOnly value={text} placeholder="Historique des dictées ligne par ligne" />
        <button className={recording === block ? 'recording' : 'primary'} onClick={() => toggleRecord(block)}>
          {recording === block ? '■ Arrêter la dictée' : '🎙 Dicter les travaux'}
        </button>
        <button onClick={add}>+ Ajouter ligne manuelle</button>
        <span className="badge">Une ligne après chaque montant</span>
      </section>

      <section className="card">
        {lines.map((line, i) => (
          <div className="line" key={line.id || i}>
            <input placeholder="Description" value={line.desc || ''} onChange={(e) => update(i, 'desc', e.target.value)} />
            <input placeholder="€" value={line.amount || ''} onChange={(e) => update(i, 'amount', e.target.value)} />
            <button onClick={() => remove(i)}>×</button>
          </div>
        ))}
      </section>
      </main>
    </>
  );
}

function filenameFromHeader(header) {
  return header?.match(/filename="([^"]+)"/)?.[1] || null;
}

createRoot(document.getElementById('root')).render(<App />);
