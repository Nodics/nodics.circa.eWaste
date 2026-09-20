import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LocateFixed, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { APP_API, request, nameOf, statusLabel, type Centre, type Experience } from '../api';
import type { JourneyHost } from '../channels/journeyHost';
import { LocationMapCanvas } from '../map/LocationMapCanvas';
import { useMapConfiguration } from '../map/useMapConfiguration';
import { useMapLocation } from '../map/useMapLocation';
import { centreDistanceMetres } from '../map/sortCentresByDistance';
import { CentreCard } from './MobilePrimitives';
import { emptyCentreFilters, filterCentres, hasCentrePosition, type CentreFilters } from './centreFilters';

/** One public result set drives the map and cards on both mobile hosts. */
export function MobileCentres({ experience, host, onStart }: { experience: Experience; host: JourneyHost; onStart: () => void }) {
  const [updatedExperience, setUpdatedExperience] = useState<Experience | null>(null);
  const [refreshing, setRefreshing] = useState(false), [refreshError, setRefreshError] = useState('');
  const centres = updatedExperience?.centres || experience.centres;
  const pendingRefresh = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (pendingRefresh.current) return;
    const controller = new AbortController();
    pendingRefresh.current = controller;
    setRefreshing(true); setRefreshError('');
    try {
      const next = await request<Experience>(`${APP_API}/experience`, undefined, undefined, 'GET', { signal: controller.signal });
      if (!controller.signal.aborted) setUpdatedExperience(next);
    } catch {
      if (!controller.signal.aborted) setRefreshError('We couldn’t refresh the centres. Your current list is still available. Please try again.');
    } finally {
      if (pendingRefresh.current === controller) {
        pendingRefresh.current = null;
        setRefreshing(false);
      }
    }
  }, []);
  useEffect(() => {
    void refresh();
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      pendingRefresh.current?.abort();
      pendingRefresh.current = null;
    };
  }, [refresh]);
  const [filters, setFilters] = useState<CentreFilters>(emptyCentreFilters);
  const [showFilters, setShowFilters] = useState(false), [selected, setSelected] = useState<Centre | null>(null);
  const { configuration, error: mapError, retry } = useMapConfiguration();
  const { location, error: locationError, locate, locating } = useMapLocation(host);
  const map = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => filterCentres(centres, filters, location), [centres, filters, location]);
  const mapped = useMemo(() => visible.filter(hasCentrePosition), [visible]);
  const current = selected && visible.find(centre => centre.code === selected.code) || null;
  const count = Object.entries(filters).filter(([key, value]) => key !== 'sort' && value).length;
  const update = (key: keyof CentreFilters, value: string) => { setFilters(previous => ({ ...previous, [key]: value })); setSelected(null); };
  const options = (get: (centre: Centre) => (string | undefined)[]) => [...new Set(centres.flatMap(get).filter((value): value is string => !!value))].sort();
  const cities = options(centre => [centre.city]), countries = options(centre => [centre.countryCode]);
  const types = options(centre => [centre.collectionPointType]), operators = options(centre => [centre.operatorEnterpriseName]);
  const services = options(centre => centre.serviceCapabilities || []), categories = options(centre => centre.metadata?.acceptedCategoryCodes || []);
  const facet = (key: keyof CentreFilters, label: string, values: string[], title: (value: string) => string = value => value) => <label>{label}<select aria-label={label} value={filters[key]} onChange={event => update(key, event.target.value)} disabled={!values.length}><option value="">{values.length ? `All ${label.toLowerCase()}` : 'Not provided by centres'}</option>{values.map(value => <option value={value} key={value}>{title(value)}</option>)}</select></label>;
  const reset = () => { setFilters(emptyCentreFilters); setSelected(null); };
  const directions = (centre: Centre) => host.openMap(`https://www.google.com/maps/dir/?api=1&destination=${centre.latitude ?? centre.location?.latitude},${centre.longitude ?? centre.location?.longitude}`);
  return <section className="mobile-centres" aria-label="Find collection centres">
    <span className="mobile-eyebrow">Find your next stop</span><h1>A centre that<br/>works for you.</h1><p>Explore the map and compare collection points before you visit.</p>
    <label className="mobile-search"><Search size={19}/><input aria-label="Search collection centres" placeholder="Search centre, area or operator" value={filters.search} onChange={event => update('search', event.target.value)}/></label>
    <div className="mobile-centres-tools">
      <button className="mobile-secondary" aria-expanded={showFilters} aria-controls="centre-filters" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={17}/>Filters{count ? ` (${count})` : ''}</button>
      <button className="mobile-secondary" disabled={locating} onClick={() => { update('sort', 'distance'); locate(); }}><LocateFixed size={17}/>{locating ? 'Locating…' : location ? 'Refresh location' : 'Near me'}</button>
    </div>
    <button className="mobile-text" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing centres…' : 'Refresh centres'}</button>
    {refreshError && <p role="status" className="mobile-centre-notice">{refreshError}</p>}
    {locationError && <p role="status" className="mobile-centre-notice">{locationError}</p>}
    {showFilters && <div id="centre-filters" className="mobile-centres-filter-panel">
      <div className="mobile-centres-filter-grid">
        {facet('city', 'Cities', cities)}{facet('country', 'Countries', countries)}
        {facet('type', 'Centre types', types, statusLabel)}{facet('operator', 'Operators', operators)}
        {facet('service', 'Services', services, statusLabel)}
        {facet('category', 'Accepted items', categories, code => nameOf((updatedExperience || experience).categories.find(category => category.code === code)?.name) || statusLabel(code))}
        <label>Distance<select aria-label="Distance" aria-describedby="centre-distance-help" value={filters.radius} disabled={!location} onChange={event => update('radius', event.target.value)}><option value="">Any distance</option>{[1, 5, 10, 25, 50, 100].map(km => <option key={km} value={km}>Within {km} km</option>)}</select></label>
        <label>Sort by<select aria-label="Sort by" value={filters.sort} onChange={event => update('sort', event.target.value)}><option value="name">Name A–Z</option><option value="distance" disabled={!location}>Nearest first</option></select></label>
      </div>
      <p id="centre-distance-help">{location ? 'Distances are approximate, measured in a straight line.' : 'Tap Near me to enable distance filters and nearest-first sorting.'}</p>
      {centres.some(centre => !centre.metadata?.acceptedCategoryCodes?.length) && <p>Filtering by accepted items shows only centres with published acceptance details. Confirm acceptance and opening hours before visiting.</p>}
      <button className="mobile-text" onClick={reset}>Reset all filters</button>
    </div>}
    {count > 0 && <div className="mobile-centres-active"><span>{count} {count === 1 ? 'filter' : 'filters'} applied</span><button className="mobile-text" onClick={reset}>Clear all <X size={14}/></button></div>}
    <div className="mobile-section-heading"><h2>Explore the map</h2><span className="mobile-count">{mapped.length} mapped</span></div>
    <div className="mobile-centres-map" ref={map}>
      {configuration ? <LocationMapCanvas configuration={configuration} centres={mapped} selected={current} locate={location} onSelect={setSelected} details={current && <div className="mobile-centre-popup"><button className="mobile-icon" aria-label="Close centre details" onClick={() => setSelected(null)}><X size={18}/></button><strong>{nameOf(current.name)}</strong><p>{[current.addressLine, current.city].filter(Boolean).join(', ')}</p>{current.metadata?.hours && <p>{current.metadata.hours}</p>}<button className="mobile-text" onClick={() => directions(current)}>Directions <ArrowRight size={15}/></button></div>}/> : <div className="map-canvas mobile-loading" role="status">{mapError ? 'Map unavailable. Browse the centres below.' : 'Loading map…'}</div>}
    </div>
    {mapError && <p className="mobile-centre-notice" role="status">{mapError} <button className="mobile-text" onClick={retry}>Retry map</button></p>}
    {visible.length > mapped.length && <p className="mobile-centre-notice">{visible.length - mapped.length} {visible.length - mapped.length === 1 ? 'centre has' : 'centres have'} no published map position and {visible.length - mapped.length === 1 ? 'is' : 'are'} listed below.</p>}
    <div className="mobile-section-heading"><h2>Collection centres</h2><span className="mobile-count" role="status">{visible.length} of {centres.length} found</span></div>
    <div className="mobile-stack">{visible.map(centre => {
      const distance = centreDistanceMetres(centre, location);
      return <div key={centre.code} className={`mobile-centre-result ${current?.code === centre.code ? 'is-selected' : ''}`}>
        <CentreCard centre={{ ...centre, distanceMetres: distance ?? undefined }} host={host}/>
        <div className="mobile-centre-result-footer"><small>{statusLabel(centre.collectionPointType || 'Collection centre')}</small>{hasCentrePosition(centre) && <button className="mobile-text" aria-label={`Show ${nameOf(centre.name)} on map`} onClick={() => { setSelected(centre); map.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }}>Show on map <MapPin size={15}/></button>}</div>
      </div>;
    })}</div>
    {!visible.length && <div className="mobile-empty"><MapPin size={32}/><h2>{count ? 'No matching centres' : 'No centres available'}</h2><p>{count ? 'Try a wider distance or fewer filters.' : 'Please check again later.'}</p>{count > 0 && <button className="mobile-text" onClick={reset}>Reset all filters</button>}</div>}
    <div className="mobile-card mobile-arrived"><h2>Already at a centre?</h2><p>Start a submission. We’ll confirm your arrival using your location.</p><button className="mobile-primary" onClick={onStart}>Recycle an item <ArrowRight size={18}/></button></div>
  </section>;
}
