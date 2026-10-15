import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { valid, NOW } from './fixtures.js';
import { buildWorkbook } from '../src/workbook.js';
import { totals } from '../src/domain.js';

test('export préserve toutes les références et corrige autres mécanique', async () => {
  const d = valid();
  d.vehicle.marque = '=HYPERLINK("https://example.com")';
  const wb = await buildWorkbook(d, NOW),
    sheet = wb.worksheets[0];
  assert.equal(sheet.getCell('B8').value, d.vehicle.marque);
  assert.equal(sheet.getCell('B8').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('B10').value, d.vehicle.motorisation);
  assert.equal(sheet.getCell('D25').value, 100.25);
  assert.equal(sheet.getCell('E25').value.formula, 'D25');
  assert.equal(sheet.getCell('E25').value.result, 100.25);
  assert.equal(sheet.getCell('E60').value.result, totals(d, NOW).total / 100);
  assert.equal(sheet.getCell('E62').value.result, totals(d, NOW).cost / 100);
});
test('export de 200 + 200 travaux sans perte ; somme reliée au détail', async () => {
  const d = valid();
  for (const block of ['body', 'cell'])
    d[block] = Array.from({ length: 200 }, (_, i) => ({
      id: `${block}${i}`,
      desc: `${block} travail ${i + 1}`,
      amount: '123.45',
    }));
  const wb = await buildWorkbook(d, NOW),
    original = wb.worksheets[0];
  assert.match(original.getCell('E29').value.formula, /SUMIF\(Travaux!/);
  assert.match(original.getCell('E38').value.formula, /SUMIF\(Travaux!/);
  const buffer = await wb.xlsx.writeBuffer(),
    read = new ExcelJS.Workbook();
  await read.xlsx.load(buffer);
  const details = read.getWorksheet('Travaux');
  assert.equal(details.rowCount, 402);
  assert.equal(details.getCell('B401').value, 'cell travail 200');
  assert.equal(details.getCell('C401').value, 123.45);
  assert.equal(details.getCell('C402').value.result, 49380);
  assert.equal(read.worksheets[0].getCell('E60').value.result, totals(d, NOW).total / 100);
});
test('les lignes standards restent dans le modèle historique', async () => {
  const d = valid();
  d.body = [{ desc: 'Pare-chocs', amount: '123,45' }];
  const wb = await buildWorkbook(d, NOW);
  assert.equal(wb.worksheets[0].getCell('E29').value, 123.45);
});
test('fiche invalide refusée avant génération', async () => {
  const d = valid();
  d.vehicle.mec = 'incorrect';
  await assert.rejects(buildWorkbook(d, NOW), (e) =>
    e.errors.some((x) => x.path === 'vehicle.mec'),
  );
});
