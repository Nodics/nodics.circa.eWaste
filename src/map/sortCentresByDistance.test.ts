import { describe, expect, it } from 'vitest';
import type { Centre } from '../api';
import { sortCentresByDistance } from './sortCentresByDistance';

const centre = (code: string, latitude?: number, longitude?: number): Centre => ({ code, name: { en: code }, latitude, longitude });

describe('Collection centre distance order', () => {
  it('keeps the source order when location is absent or invalid', () => {
    const records = [centre('first', 20, 30), centre('second', 0, 0)];
    expect(sortCentresByDistance(records, null)).toBe(records);
    expect(sortCentresByDistance(records, { latitude: NaN, longitude: 0 })).toBe(records);
  });
  it('sorts nearest first without mutating the original list, and keeps ties stable', () => {
    const records = [centre('far', 20, 0), centre('near-first', 1, 0), centre('near-second', 1, 0), centre('here', 0, 0)];
    expect(sortCentresByDistance(records, { latitude: 0, longitude: 0 }).map(c => c.code)).toEqual(['here', 'near-first', 'near-second', 'far']);
    expect(records.map(c => c.code)).toEqual(['far', 'near-first', 'near-second', 'here']);
  });
  it('uses nested Location coordinates and leaves missing or invalid positions last', () => {
    const records = [centre('missing'), centre('invalid', 91, 0), { ...centre('nested'), location: { latitude: 0, longitude: 0 } }, centre('valid', 10, 10)];
    expect(sortCentresByDistance(records, { latitude: 0, longitude: 0 }).map(c => c.code)).toEqual(['nested', 'valid', 'missing', 'invalid']);
  });
  it('uses geographic distance across the international date line', () => {
    const records = [centre('far', 0, 170), centre('near', 0, -179.9)];
    expect(sortCentresByDistance(records, { latitude: 0, longitude: 179.9 }).map(c => c.code)).toEqual(['near', 'far']);
  });
});
