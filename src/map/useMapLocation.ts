import { useCallback, useEffect, useRef, useState } from 'react';
import { type JourneyHost, webJourneyHost } from '../channels/journeyHost';
import type { MapPosition } from './sortCentresByDistance';

/** Reuses granted browser access silently; only the location button may request permission. */
export function useMapLocation(host: JourneyHost = webJourneyHost) {
  const [location, setLocation] = useState<MapPosition | null>(null);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const locate = useCallback((showError = true) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLocating(true);
    void host.capture(controller.signal, 10000).then(position => {
      if (controller.signal.aborted) return;
      setLocation({ latitude: position.latitude, longitude: position.longitude });
      setError('');
    }).catch(() => {
      if (controller.signal.aborted) return;
      setLocation(null);
      setError(showError ? 'Location was not shared. Search or choose a centre below.' : '');
    }).finally(() => { if (!controller.signal.aborted) setLocating(false); });
  }, [host]);

  useEffect(() => {
    let disposed = false;
    let permission: PermissionStatus | undefined;
    const refresh = () => {
      if (disposed) return;
      if (permission?.state === 'granted') locate(false);
      else {
        pending.current?.abort();
        setLocation(null);
        setLocating(false);
        setError('');
      }
    };
    if (host.kind === 'telegram') {
      void host.permission().then(value => { if (!disposed && value === 'granted') locate(false); }).catch(() => {});
    } else if (navigator.permissions && navigator.geolocation) {
      void navigator.permissions.query({ name: 'geolocation' }).then(value => {
        if (disposed) return;
        permission = value;
        permission.addEventListener('change', refresh);
        window.addEventListener('focus', refresh);
        refresh();
      }).catch(() => { /* Browsers without permission inspection retain explicit sharing. */ });
    }
    return () => {
      disposed = true;
      pending.current?.abort();
      permission?.removeEventListener('change', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [locate, host]);

  return { location, error, locate, locating };
}
