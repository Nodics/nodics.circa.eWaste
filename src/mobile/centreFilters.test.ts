import { describe, expect, it } from 'vitest';
import type { Centre } from '../api';
import { emptyCentreFilters, filterCentres, hasCentrePosition } from './centreFilters';
const records: Centre[] = [
  { code: 'near', name: { en: 'Zed Drop-off' }, city: 'Dubai', countryCode: 'AE', operatorEnterpriseName: 'Circular', collectionPointType: 'DROP_OFF', serviceCapabilities: ['RECEIPT'], metadata: { acceptedCategoryCodes: ['PHONE'] }, latitude: 25, longitude: 55 },
  { code: 'far', name: { en: 'Alpha Depot' }, city: 'Abu Dhabi', collectionPointType: 'DEPOT', serviceCapabilities: ['RECEIPT'], location: { latitude: 24, longitude: 54 } },
  { code: 'missing', name: { en: 'Beta' }, city: 'Dubai' },
];
describe('Public centre discovery', () => {
  it('combines text and published facets without modifying records', () => {
    const filters = { ...emptyCentreFilters, search: '  CIRCULAR  Zed ', city: 'Dubai', country: 'AE', type: 'DROP_OFF', operator: 'Circular', service: 'RECEIPT', category: 'PHONE' };
    expect(filterCentres(records, filters, null).map(c => c.code)).toEqual(['near']);
    expect(filterCentres(records, { ...filters, city: 'Abu Dhabi' }, null)).toEqual([]);
    expect(records.map(c => c.code)).toEqual(['near', 'far', 'missing']);
  });
  it('does not infer acceptance when a centre has no acceptance categories', () => {
    expect(filterCentres(records, { ...emptyCentreFilters, category: 'PHONE' }, null).map(c => c.code)).toEqual(['near']);
  });
  it('filters by straight-line radius and excludes unlocated records only when distance is required', () => {
    expect(filterCentres(records, emptyCentreFilters, null)).toHaveLength(3);
    expect(filterCentres(records, { ...emptyCentreFilters, radius: '5' }, { latitude: 25, longitude: 55 }).map(c => c.code)).toEqual(['near']);
    expect(filterCentres(records, { ...emptyCentreFilters, radius: '5' }, null)).toEqual([]);
    expect(hasCentrePosition({ ...records[0], latitude: 91 })).toBe(false);
  });
  it('sorts nearest first with unknown distances last and falls back to names without location', () => {
    expect(filterCentres(records, { ...emptyCentreFilters, sort: 'distance' }, { latitude: 25, longitude: 55 }).map(c => c.code)).toEqual(['near', 'far', 'missing']);
    expect(filterCentres(records, { ...emptyCentreFilters, sort: 'distance' }, null).map(c => c.code)).toEqual(['far', 'missing', 'near']);
  });
});
