import { latLng } from 'leaflet';
import type { Centre } from '../api';

export type MapPosition = { latitude: number; longitude: number };

function validPosition(position: Partial<MapPosition> | null): position is MapPosition {
  return !!position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
    && Math.abs(position.latitude!) <= 90 && Math.abs(position.longitude!) <= 180;
}

/** Reuses the map's geographic calculation for both sorting and the displayed distance. */
export function centreDistanceMetres(centre: Centre, origin: MapPosition | null): number | null {
  const position = {
    latitude: centre.latitude ?? centre.location?.latitude,
    longitude: centre.longitude ?? centre.location?.longitude,
  };
  if (!validPosition(origin) || !validPosition(position)) return null;
  return latLng(origin.latitude, origin.longitude).distanceTo(latLng(position.latitude, position.longitude));
}

/** Formats approximate straight-line distance at a useful display precision. */
export function formatCentreDistance(distance: number | null): string | null {
  if (distance === null || !Number.isFinite(distance) || distance < 0) return null;
  return Math.round(distance) < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`;
}

/** Sorts this displayed list by straight-line distance without changing the source order. */
export function sortCentresByDistance(centres: Centre[], origin: MapPosition | null): Centre[] {
  if (!validPosition(origin)) return centres;
  return centres.map(centre => ({ centre, distance: centreDistanceMetres(centre, origin) ?? Infinity }))
    .sort((left, right) => left.distance === right.distance ? 0 : left.distance - right.distance)
    .map(({ centre }) => centre);
}
