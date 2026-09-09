import { useEffect, useState } from 'react';
import { unwrap } from '../api';
import { parseMapInteraction, parseMapPresentation, type MapInteraction, type MapPresentation } from './locationMapContract';
export interface MapRenderDescriptor {
  providerCode: string;
  rendererType: string;
  styleUrl: string;
  tileUrlTemplate: string;
  publicAccessToken: string;
  attribution: string;
  frontendSafe: boolean;
}
export interface SharedMapConfiguration {
  contractVersion: number;
  code: string;
  revision: number;
  surfaceCode: string;
  configured: boolean;
  status: string;
  fallbackAllowed: boolean;
  refreshIntervalMs: number;
  defaultCenter: { latitude: number; longitude: number };
  defaultZoom: number;
  minimumZoom: number;
  maximumZoom: number;
  enabledControls: string[];
  presentation: MapPresentation;
  interaction: MapInteraction;
  renderDescriptor?: MapRenderDescriptor;
  fallbackRenderer?: MapRenderDescriptor;
}
/** Reads the same Location-owned usage as Axis. It never creates a storefront configuration. */
export function useMapConfiguration() {
  const [configuration, setConfiguration] = useState<SharedMapConfiguration>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false, inFlight = false, timer: ReturnType<typeof setTimeout>;
    let refreshInterval = 15000;
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      controller.signal.addEventListener('abort', abort);
      const deadline = setTimeout(abort, 10000);
      try {
        const response = await fetch('/nodics/locationMap/v0/location/maps/configurations/public?usageCode=COLLECTION_CENTRE_MAP', { headers: { 'x-enterprise-code': 'default' }, cache: 'no-store', signal: timeout.signal });
        if (!response.ok) throw Error('Map settings are temporarily unavailable.');
        const result = unwrap<SharedMapConfiguration>(await response.json());
        const presentation = parseMapPresentation(result.presentation), interaction = parseMapInteraction(result.interaction);
        if (result.contractVersion !== 1 || !presentation || !interaction || !Array.isArray(result.enabledControls)) throw Error('Map settings could not be read.');
        if (!Number.isFinite(result.defaultCenter?.latitude) || !Number.isFinite(result.defaultCenter?.longitude) || !Number.isFinite(result.defaultZoom)) throw Error('Map position could not be read.');
        refreshInterval = Math.max(5000, Math.min(60000, result.refreshIntervalMs || 15000));
        if (!stopped) {
          setConfiguration(previous => JSON.stringify(previous) === JSON.stringify(result) ? previous : result);
          setError('');
        }
      } catch {
        if (!stopped) setError('Map settings could not be refreshed. You can still choose a centre from the list.');
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener('abort', abort);
        inFlight = false;
        if (!stopped) { clearTimeout(timer); timer = setTimeout(() => { if (!document.hidden) void refresh(); }, refreshInterval); }
      }
    };
    const resume = () => { if (!document.hidden) { clearTimeout(timer); void refresh(); } };
    void refresh();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume); };
  }, [retry]);
  return { configuration, error, retry: () => setRetry(value => value + 1) };
}
