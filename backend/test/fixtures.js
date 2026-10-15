import { INITIAL, MECHANICS } from '../src/domain.js';
export const NOW = new Date('2026-10-15T12:00:00Z');
export function valid() {
  const d = structuredClone(INITIAL);
  Object.assign(d.vehicle, {
    marque: 'Marque rare',
    modele: 'Prototype 640-X',
    motorisation: 'Porteur inconnu 2.2 136 ch BVA',
    mec: '2023-03-12',
    immat: 'AB-123-CD',
    kilometrage: '42000',
    prixAchat: '30000.50',
    cessionOdoo: '32000',
    commercial: 'Équipe test',
  });
  for (const key of Object.keys(MECHANICS)) d.mechanics[key] = 'NON';
  d.mechanics.autresMeca = '100.25';
  d.inspection = { body: true, cell: true };
  d.taxBasis = 'HT';
  d.pricingReviewed = true;
  d.confirmed = true;
  return d;
}
