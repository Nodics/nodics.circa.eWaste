import { useEffect, useMemo, useState } from 'react';
import { MapPin, Maximize2, Minimize2, LocateFixed } from 'lucide-react';
import { nameOf, type Centre } from './api';
import { useMapConfiguration } from './map/useMapConfiguration';
import { categoryForFeature } from './map/locationMapContract';
import { LocationPopupContent } from '@nodics/location-map-ui';
import '@nodics/location-map-ui/styles.css';
import { LocationMapCanvas } from './map/LocationMapCanvas';
import { centreDistanceMetres, formatCentreDistance, sortCentresByDistance } from './map/sortCentresByDistance';
import { useMapLocation } from './map/useMapLocation';

/** Customer map composition; Location owns configuration and Waste owns public centre visibility. */
export function CollectionMap({ centres, onChoose }: { centres: Centre[]; onChoose: (centre: Centre) => void }) {
  const { configuration, error: configurationError, retry } = useMapConfiguration();
  const [expanded, setExpanded] = useState(false), [selected, setSelected] = useState<Centre | null>(null), [search, setSearch] = useState('');
  const [filters, setFilters] = useState<string[]>([]);
  const { location, error, locate } = useMapLocation();
  const showFilters = configuration?.enabledControls.includes('FILTERS') === true;
  const visible = useMemo(() => sortCentresByDistance(centres.filter(centre => {
    const text = [nameOf(centre.name), centre.addressLine, centre.city].filter(Boolean).join(' ').toLowerCase();
    const category = categoryForFeature(centre, configuration?.presentation);
    const selectedFilters = showFilters ? filters.filter(code => configuration?.presentation.categories.some(category => category.code === code)) : [];
    return text.includes(search.toLowerCase()) && (!selectedFilters.length || selectedFilters.includes(category?.code || ''));
  }), location), [centres, configuration?.presentation, filters, search, showFilters, location]);
  const visibleSelected = selected && visible.some(centre => centre.code === selected.code) ? selected : null;
  useEffect(() => {
    if (!expanded && !selected) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (selected) setSelected(null); else setExpanded(false); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [expanded, selected]);
  const latitude = visibleSelected?.latitude ?? visibleSelected?.location?.latitude, longitude = visibleSelected?.longitude ?? visibleSelected?.location?.longitude;
  return <div className={`collection-layout ${expanded ? 'expanded-map' : ''}`}>
    <div className="map-column">
      <div className="map-toolbar">
        <span><MapPin size={16} /> Collection network</span>
        {showFilters && <div className="map-type-filters" aria-label="Collection centre types">
          {configuration.presentation.categories.map(category => <button key={category.code} aria-pressed={filters.includes(category.code)} className={filters.includes(category.code) ? 'active' : ''} style={{ borderColor: category.color }} onClick={() => setFilters(previous => previous.includes(category.code) ? previous.filter(code => code !== category.code) : [...previous, category.code])}><span className="map-type-dot" style={{ backgroundColor: category.color }} />{category.label}</button>)}
        </div>}
        <div className="map-toolbar-actions">
          {configuration?.enabledControls.includes('GEOLOCATE') && <button className="icon-button" aria-label="Find centres near me" onClick={() => locate()}><LocateFixed size={18} /></button>}
          <button className="icon-button" aria-label={expanded ? 'Collapse map' : 'Expand map'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        </div>
      </div>
      <div className="map-viewport">
        {configuration?.interaction.wheelZoomMode === 'MODIFIER' && <p className="map-gesture-hint">Use {/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? 'Command' : 'Control'} + scroll to zoom.</p>}
        {configuration ? <LocationMapCanvas configuration={configuration} centres={visible} selected={visibleSelected} locate={location} onSelect={setSelected} details={visibleSelected && Number.isFinite(latitude) && Number.isFinite(longitude) ? <LocationPopupContent
          location={{ name: nameOf(visibleSelected.name), latitude: latitude!, longitude: longitude!, mapCategory: categoryForFeature(visibleSelected, configuration.presentation) }}
          directionsEnabled={configuration.enabledControls.includes('DIRECTIONS')} directionsOrigin={location || undefined}
          onClose={() => setSelected(null)}
        /> : null} /> : <div className="map-canvas map-loading" role="status">{configurationError ? 'Map imagery is unavailable.' : 'Loading map…'}</div>}
      </div>
      {(error || configurationError) && <p role="status" className="map-notice">{error || configurationError} {configurationError && <button onClick={retry}>Retry map settings</button>}</p>}
    </div>
    <aside className="centre-list">
      <label className="sr-only" htmlFor="centre-search">Search collection centres</label>
      <input id="centre-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a centre or area" />
      {visible.map(centre => {
        const category = categoryForFeature(centre, configuration?.presentation);
        const distance = formatCentreDistance(centreDistanceMetres(centre, location));
        return <button key={centre.code} className={`centre-row ${selected?.code === centre.code ? 'selected' : ''}`} onClick={() => setSelected(centre)}>
          <MapPin size={18} style={{ color: category?.color }} />
          <span className="centre-row-content"><span className="centre-row-title"><strong>{nameOf(centre.name)}</strong>{distance && <span className="centre-distance" title="Approximate direct distance from your location" aria-label={`${distance} from your location`}>{distance}</span>}</span><small>{category?.label}{category ? ' · ' : ''}{centre.addressLine || centre.city || 'Select for collection details'}</small>{selected?.code === centre.code && <small>{centre.metadata?.hours || 'Confirm opening hours before visiting.'}</small>}</span>
        </button>;
      })}
      {!visible.length && <p>No collection centres match your selection.</p>}
      {visibleSelected && <div className="centre-action"><p>{visibleSelected.acceptanceSummary?.en || 'Ask the centre about acceptance and safe handling.'}</p>
        {configuration?.enabledControls.includes('DIRECTIONS') && Number.isFinite(latitude) && Number.isFinite(longitude) && <a className="secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`} target="_blank" rel="noopener noreferrer">Directions</a>}
        <button className="primary" onClick={() => { onChoose(visibleSelected); setExpanded(false); }}>Submit at this centre</button>
      </div>}
    </aside>
  </div>;
}
