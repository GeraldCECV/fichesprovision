import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { validate, totals, parseCents, MECHANICS, VEHICLE_LABELS } from './domain.js';

export async function buildWorkbook(data, now = new Date()) {
  const errors = validate(data, now);
  if (errors.length) {
    const e = new Error('Fiche à compléter');
    e.errors = errors;
    throw e;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(
    fileURLToPath(new URL('../assets/template_fiche_provision.xlsx', import.meta.url)),
  );
  const s = wb.worksheets[0],
    v = data.vehicle,
    m = data.mechanics,
    t = totals(data, now);
  const set = (cell, value) => {
    s.getCell(cell).value = value;
  };
  const euros = (value) => parseCents(value) / 100;
  const formula = (cell, expression, cents) =>
    set(cell, { formula: expression, result: cents / 100 });
  set('B8', v.marque);
  set('B9', v.modele);
  set('B10', v.motorisation);
  set('E8', v.mec.split('-').reverse().join('/'));
  set('E9', v.immat);
  set('E10', euros(v.prixAchat));
  set('E11', euros(v.cessionOdoo));
  set('B12', v.commercial);
  set('E12', new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(now));
  set('E13', euros(data.fees.admin));
  const rows = {
    prepEsthetique: 14,
    ct: 18,
    vidangeSimple: 19,
    vidangeComplete: 20,
    courroie: 21,
    courroiePompe: 22,
    batterie: 24,
  };
  for (const [key, row] of Object.entries(rows)) {
    set(`D${row}`, m[key]);
    formula(
      `E${row}`,
      `IF(D${row}="OUI",${MECHANICS[key][1]},0)`,
      m[key] === 'OUI' ? MECHANICS[key][1] * 100 : 0,
    );
  }
  const trains = Number(m.pneusAvant === 'OUI') + Number(m.pneusArriere === 'OUI');
  set('D23', trains);
  formula('E23', 'D23*400', trains * 40000);
  s.getCell('D23').dataValidation = { type: 'list', allowBlank: false, formulae: ['"0,1,2"'] };
  set('D25', euros(m.autresMeca));
  formula('E25', 'D25', parseCents(m.autresMeca));
  for (let row = 29; row <= 34; row++) {
    set(`A${row}`, '');
    set(`E${row}`, null);
  }
  for (let row = 38; row <= 51; row++) {
    set(`A${row}`, '');
    set(`E${row}`, null);
  }
  for (const [block, start, capacity] of [
    ['body', 29, 6],
    ['cell', 38, 14],
  ]) {
    if (data[block].length <= capacity)
      data[block].forEach((l, i) => {
        set(`A${start + i}`, l.desc);
        set(`E${start + i}`, euros(l.amount));
      });
    else {
      set(`A${start}`, `${data[block].length} travaux — détail exhaustif dans l’onglet Travaux`);
      formula(
        `E${start}`,
        `SUMIF(Travaux!A2:A${1 + data.body.length + data.cell.length},"${block === 'body' ? 'Carrosserie' : 'Cellule'}",Travaux!C2:C${1 + data.body.length + data.cell.length})`,
        t[block],
      );
      s.getRow(start).height = 32;
      s.getCell(`A${start}`).alignment = { wrapText: true, vertical: 'top' };
    }
  }
  set('A54', 'Pack fraîcheur');
  set('E54', euros(data.fees.pack));
  set('A55', 'Test d’humidité');
  set('E55', euros(data.fees.humidite));
  set('A56', 'Divers');
  set('E56', euros(data.fees.divers));
  set('E57', null);
  set('E58', t.surprise / 100);
  formula('E60', 'E13+E14+SUM(E18:E25)+SUM(E29:E34)+SUM(E38:E51)+SUM(E54:E57)+E58', t.total);
  formula('E62', 'E10+E60', t.cost);
  set('A64', `Montants ${data.taxBasis} • Tarifs relus et fiche confirmée par ${v.commercial}`);
  s.mergeCells('A64:E64');
  s.getCell('A64').alignment = { wrapText: true };
  s.getRow(64).height = 32;
  s.pageSetup.printArea = 'A1:E64';
  const detail = wb.addWorksheet('Travaux');
  detail.columns = [
    { header: 'Rubrique', key: 'block', width: 20 },
    { header: 'Description', key: 'desc', width: 85 },
    { header: `Montant ${data.taxBasis} (€)`, key: 'amount', width: 22 },
  ];
  for (const block of ['body', 'cell'])
    for (const l of data[block])
      detail.addRow({
        block: block === 'body' ? 'Carrosserie' : 'Cellule',
        desc: l.desc,
        amount: euros(l.amount),
      });
  const last = detail.rowCount;
  detail.addRow([
    'TOTAL',
    '',
    { formula: last >= 2 ? `SUM(C2:C${last})` : '0', result: (t.body + t.cell) / 100 },
  ]);
  detail.getColumn(3).numFmt = '#,##0.00 "€"';
  detail.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  const trace = wb.addWorksheet('Validation');
  trace.columns = [
    { header: 'Information', width: 42 },
    { header: 'Valeur confirmée', width: 85 },
  ];
  for (const [key, label] of Object.entries(VEHICLE_LABELS)) trace.addRow([label, v[key] || '']);
  trace.addRow(['Base des montants', data.taxBasis]);
  trace.addRow(['Forfaits', 'Tarifs issus du modèle historique, relus avant export']);
  trace.addRow([
    'Mauvaises surprises',
    '250 € jusqu’à 4 ans inclus ; 500 € jusqu’à 8 ans inclus ; 750 € au-delà',
  ]);
  trace.addRow(['Date de génération', now.toISOString()]);
  trace.addRow(['Notes', data.notes]);
  trace.addRow(['Pneus', `Avant : ${m.pneusAvant} ; arrière : ${m.pneusArriere}`]);
  for (const sh of [detail, trace]) {
    sh.views = [{ state: 'frozen', ySplit: 1 }];
    sh.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sh.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF163F48' } };
    sh.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };
    sh.eachRow((row, i) => {
      if (i > 1)
        row.height = Math.max(24, Math.ceil(String(row.getCell(2).value || '').length / 75) * 18);
    });
  }
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}
