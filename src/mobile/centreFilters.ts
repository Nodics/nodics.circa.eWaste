import { nameOf, type Centre } from '../api';
import { centreDistanceMetres, type MapPosition } from '../map/sortCentresByDistance';

export type CentreFilters = { search: string; city: string; country: string; type: string; operator: string; service: string; category: string; radius: string; sort: string };
export const emptyCentreFilters: CentreFilters = { search: '', city: '', country: '', type: '', operator: '', service: '', category: '', radius: '', sort: 'name' };
export const hasCentrePosition = (centre: Centre) => centreDistanceMetres(centre, { latitude: 0, longitude: 0 }) !== null;

/** Intersects published centre facets; missing acceptance or coordinates never imply a match. */
export function filterCentres(centres: Centre[], filters: CentreFilters, origin: MapPosition | null): Centre[] {
  const words = filters.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return centres.filter(centre => {
    const text = [nameOf(centre.name), centre.addressLine, centre.city, centre.countryCode, centre.operatorEnterpriseName].filter(Boolean).join(' ').toLocaleLowerCase();
    const distance = centreDistanceMetres(centre, origin);
    return words.every(word => text.includes(word))
      && (!filters.city || centre.city === filters.city)
      && (!filters.country || centre.countryCode === filters.country)
      && (!filters.type || centre.collectionPointType === filters.type)
      && (!filters.operator || centre.operatorEnterpriseName === filters.operator)
      && (!filters.service || centre.serviceCapabilities?.includes(filters.service))
      && (!filters.category || centre.metadata?.acceptedCategoryCodes?.includes(filters.category))
      && (!filters.radius || (distance !== null && distance <= Number(filters.radius) * 1000));
  }).sort((left, right) => {
    if (filters.sort === 'distance' && origin) {
      const difference = (centreDistanceMetres(left, origin) ?? Infinity) - (centreDistanceMetres(right, origin) ?? Infinity);
      if (difference && !Number.isNaN(difference)) return difference;
    }
    return nameOf(left.name).localeCompare(nameOf(right.name));
  });
}
