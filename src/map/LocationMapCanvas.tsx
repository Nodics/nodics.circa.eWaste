import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Map as MapboxMap, Marker as MapboxMarker, Popup as MapboxPopup } from 'mapbox-gl';
import { nameOf, type Centre } from '../api';
import { categoryForFeature, shouldHandleMapWheel } from './locationMapContract';
import type { MapRenderDescriptor, SharedMapConfiguration } from './useMapConfiguration';
interface Engine {
  leaflet?: L.Map;
  mapbox?: MapboxMap;
  MapboxMarker?: typeof MapboxMarker;
  MapboxPopup?: typeof MapboxPopup;
  zoom: () => number;
  focus: (latitude: number, longitude: number, zoom: number) => void;
  zoomTo: (zoom: number) => void;
  resize: () => void;
  remove: () => void;
}
function usable(descriptor?: MapRenderDescriptor) {
  if (!descriptor || descriptor.frontendSafe === false) return false;
  if (descriptor.rendererType === 'MAPBOX_GL') return descriptor.publicAccessToken.startsWith('pk.') && /^(mapbox:\/\/styles\/|https:\/\/)/.test(descriptor.styleUrl);
  return descriptor.rendererType === 'XYZ_TILE' && /^https:\/\//.test(descriptor.tileUrlTemplate || descriptor.styleUrl);
}
/** Self-contained renderer adapter. Location supplies all provider and presentation choices. */
export function LocationMapCanvas({ configuration, centres, selected, locate, onSelect, details }:  {
  configuration: SharedMapConfiguration;
  centres: Centre[];
  selected: Centre | null;
  locate: { latitude: number; longitude: number } | null;
  onSelect: (centre: Centre | null) => void;
  details: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null), engine = useRef<Engine | null>(null);
  const [ready, setReady] = useState(0), [failed, setFailed] = useState(false), [notice, setNotice] = useState('');
  const [popupHost, setPopupHost] = useState<HTMLDivElement | null>(null);
  const updatePopup = useRef<(() => void) | null>(null);
  const configKey = JSON.stringify(configuration);
  useEffect(() => { setFailed(false); setNotice(''); }, [configKey]);
  const active = configuration.configured && usable(configuration.renderDescriptor) && !failed;
  const descriptor = active ? configuration.renderDescriptor : configuration.fallbackAllowed && usable(configuration.fallbackRenderer) ? configuration.fallbackRenderer : undefined;
  const descriptorKey = JSON.stringify(descriptor);
  useEffect(() => {
    const element = host.current;
    if (!element || !descriptor) return;
    let cancelled = false, cleanup = () => {};
    const initialize = async () => {
      const { latitude, longitude } = configuration.defaultCenter;
      const minimum = configuration.minimumZoom ?? 0, maximum = configuration.maximumZoom ?? 20;
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : configuration.interaction.zoomAnimationSeconds;
      let instance: Engine;
      const reportFailure = () => {
        if (cancelled) return;
        if (active && configuration.fallbackAllowed) setFailed(true);
        setNotice('Map imagery is unavailable. The centre list is still available.');
      };
      if (descriptor.rendererType === 'MAPBOX_GL') {
        const { default: mapboxgl } = await import('mapbox-gl');
        if (cancelled) return;
        const map = new mapboxgl.Map({ container: element, accessToken: descriptor.publicAccessToken, style: descriptor.styleUrl, center: [longitude, latitude], zoom: configuration.defaultZoom, minZoom: minimum, maxZoom: maximum, scrollZoom: false, cooperativeGestures: false, attributionControl: true, transformRequest: url => ({ url, referrerPolicy: 'no-referrer' }) });
        map.on('error', reportFailure);
        if (configuration.enabledControls.includes('ZOOM')) map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
        if (configuration.enabledControls.includes('SCALE')) map.addControl(new mapboxgl.ScaleControl());
        instance = { mapbox: map, MapboxMarker: mapboxgl.Marker, MapboxPopup: mapboxgl.Popup, zoom: () => map.getZoom(), focus: (lat, lng, zoom) => map.flyTo({ center: [lng, lat], zoom: Math.max(minimum, Math.min(maximum, zoom)), duration: duration * 1000 }), zoomTo: zoom => { map.stop(); map.easeTo({ center: map.getCenter(), zoom, duration: duration * 1000 }); }, resize: () => map.resize(), remove: () => map.remove() };
        map.on('zoom', () => { element.dataset.mapZoom = String(map.getZoom()); });
      } else {
        const map = L.map(element, { scrollWheelZoom: false, zoomControl: false, minZoom: minimum, maxZoom: maximum, zoomAnimation: true, zoomSnap: configuration.interaction.wheelStep, zoomDelta: configuration.interaction.wheelStep }).setView([latitude, longitude], configuration.defaultZoom);
        L.tileLayer(descriptor.tileUrlTemplate || descriptor.styleUrl, { attribution: descriptor.attribution, minZoom: minimum, maxZoom: maximum }).on('tileerror', () => { if (!cancelled) setNotice('Map imagery is unavailable. The centre list is still available.'); }).addTo(map);
        if (configuration.enabledControls.includes('ZOOM')) L.control.zoom({ position: 'bottomright' }).addTo(map);
        if (configuration.enabledControls.includes('SCALE')) L.control.scale().addTo(map);
        instance = { leaflet: map, zoom: () => map.getZoom(), focus: (lat, lng, zoom) => map.flyTo([lat, lng], Math.max(minimum, Math.min(maximum, zoom)), { animate: duration > 0, duration }), zoomTo: zoom => { map.stop(); map.flyTo(map.getCenter(), zoom, { animate: duration > 0, duration, easeLinearity: 0.25 }); }, resize: () => map.invalidateSize({ animate: false }), remove: () => map.remove() };
        map.on('zoom', () => { element.dataset.mapZoom = String(map.getZoom()); });
      }
      engine.current = instance;
      element.dataset.mapZoom = String(instance.zoom());
      let lastZoomAt = -Infinity;
      const wheel = (event: WheelEvent) => {
        if (!shouldHandleMapWheel(event, configuration.interaction, navigator.platform)) return;
        event.preventDefault(); event.stopPropagation();
        const now = performance.now();
        if (now - lastZoomAt < configuration.interaction.wheelCooldownMs) return;
        const target = Math.max(minimum, Math.min(maximum, instance.zoom() + (event.deltaY > 0 ? -1 : 1) * configuration.interaction.wheelStep));
        if (target === instance.zoom()) return;
        lastZoomAt = now; instance.zoomTo(target);
      };
      element.addEventListener('wheel', wheel, { capture: true, passive: false });
      const observer = new ResizeObserver(instance.resize); observer.observe(element);
      cleanup = () => { observer.disconnect(); element.removeEventListener('wheel', wheel, true); instance.remove(); if (engine.current === instance) engine.current = null; };
      setReady(value => value + 1);
    };
    void initialize().catch(() => { if (!cancelled) { if (active && configuration.fallbackAllowed) setFailed(true); setNotice('Map imagery is unavailable. The centre list is still available.'); } });
    return () => { cancelled = true; cleanup(); };
    // A revision applies one complete configuration; expansion does not recreate the map.
  }, [configKey, descriptorKey]);
  useEffect(() => {
    const map = engine.current;
    if (!map) return;
    const remove: (() => void)[] = [];
    for (const centre of centres) {
      const latitude = centre.latitude ?? centre.location?.latitude, longitude = centre.longitude ?? centre.location?.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const category = categoryForFeature(centre, configuration.presentation);
      if (!category) continue;
      if (map.leaflet) {
        const pin = document.createElement('span'); pin.className = 'location-pin'; pin.style.backgroundColor = category.color;
        const marker = L.marker([latitude!, longitude!], { title: nameOf(centre.name), icon: L.divIcon({ className: 'location-marker', html: pin, iconSize: [42, 42], iconAnchor: [21, 42] }) }).addTo(map.leaflet);
        const tooltip = document.createElement('span'); tooltip.textContent = nameOf(centre.name); marker.bindTooltip(tooltip); marker.on('click', () => onSelect(centre));
        remove.push(() => marker.remove());
      } else if (map.mapbox && map.MapboxMarker) {
        const marker = new map.MapboxMarker({ color: category.color }).setLngLat([longitude!, latitude!]).addTo(map.mapbox);
        const element = marker.getElement(); element.setAttribute('role', 'button'); element.setAttribute('aria-label', nameOf(centre.name)); element.tabIndex = 0;
        const select = () => onSelect(centre); const keyboard = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } };
        element.addEventListener('click', select); element.addEventListener('keydown', keyboard);
        remove.push(() => { element.removeEventListener('click', select); element.removeEventListener('keydown', keyboard); marker.remove(); });
      }
    }
    return () => remove.forEach(dispose => dispose());
  }, [centres, ready, configuration.presentation, onSelect]);
  // Native provider popups host React content: no backend text is inserted as HTML.
  // Close listeners are detached before replacement, so an old popup cannot clear a new selection.
  useEffect(() => {
    const map = engine.current;
    const latitude = selected?.latitude ?? selected?.location?.latitude, longitude = selected?.longitude ?? selected?.location?.longitude;
    if (!map || !selected || !Number.isFinite(latitude) || !Number.isFinite(longitude)) { setPopupHost(null); return; }
    const container = document.createElement('div');
    let dispose = () => {};
    let refresh = () => {};
    const close = () => onSelect(null);
    map.focus(latitude!, longitude!, 14);
    if (map.leaflet) {
      const popup = L.popup({ className: 'collection-centre-popup', closeButton: false, minWidth: 220, maxWidth: 290, offset: [0, -36], autoPanPadding: [12, 12] })
        .setLatLng([latitude!, longitude!]).setContent(container).openOn(map.leaflet);
      popup.on('remove', close);
      refresh = () => popup.update();
      map.leaflet.on('moveend', refresh);
      dispose = () => { popup.off('remove', close); map.leaflet?.off('moveend', refresh); popup.remove(); };
    } else if (map.mapbox && map.MapboxPopup) {
      const popup = new map.MapboxPopup({ className: 'collection-centre-popup', closeButton: false, closeOnClick: false, focusAfterOpen: false, maxWidth: '290px', offset: 38 })
        .setLngLat([longitude!, latitude!]).setDOMContent(container).addTo(map.mapbox);
      popup.on('close', close);
      refresh = () => { popup.setDOMContent(container); };
      dispose = () => { popup.off('close', close); popup.remove(); };
    }
    const layout = () => {
      container.style.setProperty('--centre-popup-height', `${Math.max(110, Math.min(360, (host.current?.clientHeight || 260) - 65))}px`);
      refresh();
    };
    updatePopup.current = layout;
    const observer = new ResizeObserver(layout);
    if (host.current) observer.observe(host.current);
    setPopupHost(container);
    return () => { observer.disconnect(); updatePopup.current = null; dispose(); };
  }, [selected, ready, onSelect]);
  useLayoutEffect(() => { updatePopup.current?.(); }, [popupHost, details]);
  // Browser-shared position is separate from centre markers and their category filters.
  // Recreate it after renderer changes; replace/remove it when the position changes.
  useEffect(() => {
    const map = engine.current;
    if (!map || !locate || !Number.isFinite(locate.latitude) || !Number.isFinite(locate.longitude)) return;
    const element = document.createElement('div');
    element.className = 'current-location-marker';
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', 'Your current location');
    const label = document.createElement('span');
    label.className = 'current-location-marker__label';
    label.textContent = 'You';
    const pin = document.createElement('span');
    pin.className = 'current-location-marker__pin';
    element.append(label, pin);
    let remove = () => {};
    if (map.leaflet) {
      const marker = L.marker([locate.latitude, locate.longitude], {
        title: 'Your current location',
        keyboard: false,
        zIndexOffset: 1000,
        icon: L.divIcon({ className: 'leaflet-current-location-marker', html: element, iconSize: [42, 48], iconAnchor: [21, 48] }),
      }).addTo(map.leaflet);
      remove = () => marker.remove();
    } else if (map.mapbox && map.MapboxMarker) {
      const marker = new map.MapboxMarker({ element, anchor: 'bottom' })
        .setLngLat([locate.longitude, locate.latitude]).addTo(map.mapbox);
      element.style.zIndex = '1000';
      remove = () => marker.remove();
    }
    map.focus(locate.latitude, locate.longitude, 13);
    return remove;
  }, [locate, ready]);
  return <>
    {popupHost && details ? createPortal(details, popupHost) : null}
    <div ref={host} className="map-canvas" aria-label="Collection centre map" data-map-provider={descriptor?.providerCode || 'UNAVAILABLE'} data-map-configuration-code={configuration.code} data-map-revision={configuration.revision} />
    {!descriptor ? <p className="map-notice" role="status">Map imagery is not available. Choose a centre from the list.</p> : notice ? <p className="map-notice" role="status">{notice}</p> : null}
  </>;
}
