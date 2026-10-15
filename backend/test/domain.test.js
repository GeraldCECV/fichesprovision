import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL,
  MECHANICS,
  parseCents,
  parseMec,
  surpriseCents,
  totals,
  validate,
  applyProposal,
} from '../src/domain.js';
import { valid, NOW } from './fixtures.js';
test('centimes et formats français sans arrondi flottant', () => {
  for (const [input, expected] of [
    ['123,45', 12345],
    ['123.45', 12345],
    ['1 234,56 €', 123456],
    ['0', 0],
    ['0.01', 1],
    ['12.5', 1250],
  ])
    assert.equal(parseCents(input), expected);
  assert.equal(parseCents('', { empty: true }), 0);
});
test('rejette nombres ambigus, négatifs, exponentiels, incomplets et hors limites', () => {
  for (const input of [
    '',
    '-12',
    '1,234.56',
    '1.234,56',
    '1e3',
    '12.345',
    'Infinity',
    'NaN',
    '12 euros',
    null,
    {},
    '100000001',
  ])
    assert.throws(() => parseCents(input));
});
test('dates calendaires réelles, complètes et non futures', () => {
  assert.equal(parseMec('2024-02-29', NOW).toISOString(), '2024-02-29T00:00:00.000Z');
  for (const d of [
    '2023-02-29',
    '2023-04-31',
    '2023-13-10',
    '2027-01-01',
    '2023',
    '12/03/2023',
    'date incorrecte',
  ])
    assert.throws(() => parseMec(d, NOW));
});
test('la date métier suit Europe/Paris autour de minuit', () => {
  assert.doesNotThrow(() => parseMec('2026-10-16', new Date('2026-10-15T22:30:00Z')));
  assert.equal(surpriseCents('2022-10-15', new Date('2026-10-15T22:30:00Z')), 50000);
});
test('seuils exacts des mauvaises surprises, sans durée approximative', () => {
  assert.equal(surpriseCents('2022-10-15', NOW), 25000);
  assert.equal(surpriseCents('2022-10-14', NOW), 50000);
  assert.equal(surpriseCents('2018-10-15', NOW), 50000);
  assert.equal(surpriseCents('2018-10-14', NOW), 75000);
  assert.throws(() => surpriseCents('', NOW));
});
test('total exact avec frais, autres mécanique et centimes', () => {
  const d = valid();
  d.body = [{ desc: 'Pare-chocs', amount: '450.50' }];
  d.cell = [{ desc: 'Robinet', amount: '0.01' }];
  const t = totals(d, NOW);
  assert.equal(t.total, 182576);
  assert.equal(t.cost, 3182626);
  assert.equal(validate(d, NOW).length, 0);
});
test('aucune marque, référence ou motorisation inconnue ne sont rejetées', () =>
  assert.deepEqual(validate(valid(), NOW), []));
test('validation obligatoire des contrôles et confirmations', () => {
  const errors = validate(structuredClone(INITIAL), NOW);
  for (const path of ['vehicle.mec', 'mechanics.ct', 'inspection.body', 'inspection.cell'])
    assert.ok(
      errors.some((e) => e.path === path),
      path,
    );
});
test('refuse incohérences et montants manquants', () => {
  const d = valid();
  d.mechanics.vidangeSimple = 'OUI';
  d.mechanics.vidangeComplete = 'OUI';
  d.body = [{ desc: 'Travaux', amount: '' }];
  const errors = validate(d, NOW);
  for (const path of ['mechanics.vidangeComplete', 'body.0.amount'])
    assert.ok(errors.some((e) => e.path === path));
});
test('plus de 200 lignes est une erreur explicite, jamais une troncature', () => {
  const d = valid();
  d.cell = Array.from({ length: 201 }, () => ({ desc: 'Travail', amount: '1' }));
  assert.ok(validate(d, NOW).some((e) => e.path === 'cell'));
});
test('dictée partielle préserve les valeurs non mentionnées', () => {
  const d = valid();
  const n = applyProposal(d, 'vehicle', {
    vehicle: { marque: null, modele: 'Nouveau modèle', motorisation: '' },
  });
  assert.equal(n.vehicle.marque, d.vehicle.marque);
  assert.equal(n.vehicle.motorisation, d.vehicle.motorisation);
  assert.equal(n.vehicle.modele, 'Nouveau modèle');
  assert.equal(d.vehicle.modele, 'Prototype 640-X');
});
test('dictée ajoute par défaut et remplace uniquement explicitement', () => {
  const d = valid();
  d.body = [{ id: 'old', desc: 'Ancien travail', amount: '20' }];
  const p = { body: [{ desc: 'Nouveau travail', amount: '123.45' }] };
  assert.equal(applyProposal(d, 'body', p).body.length, 2);
  assert.equal(applyProposal(d, 'body', p, 'replace').body.length, 1);
  assert.equal(applyProposal(d, 'body', p).body[1].amount, '123.45');
  assert.equal(applyProposal(d, 'body', p).inspection.body, false);
});
test('choix mécanique explicite rend les alternatives exclusives', () => {
  const d = valid();
  d.mechanics.vidangeSimple = 'OUI';
  d.mechanics.ct = 'OUI';
  const n = applyProposal(d, 'mechanics', { mechanics: { vidangeComplete: 'OUI', ct: null } });
  assert.equal(n.mechanics.vidangeSimple, 'NON');
  assert.equal(n.mechanics.vidangeComplete, 'OUI');
  assert.equal(n.mechanics.ct, 'OUI');
});

test('frais inconnus refusés et jamais inclus dans le calcul', () => {
  const d = valid(),
    before = totals(d, NOW).total;
  d.fees.unknown = '999';
  assert.ok(validate(d, NOW).some((e) => e.path === 'fees'));
  assert.equal(totals(d, NOW).total, before);
});

test('les montants sont HT par défaut et le TTC est refusé', () => {
  assert.equal(INITIAL.taxBasis, 'HT');
  const d = valid();
  d.taxBasis = 'TTC';
  assert.ok(validate(d, NOW).some((e) => e.path === 'taxBasis'));
});

test('export sans confirmation manuelle des forfaits ou de la fiche', () => {
  const d = valid();
  delete d.confirmed;
  delete d.pricingReviewed;
  assert.deepEqual(validate(d, NOW), []);
});
