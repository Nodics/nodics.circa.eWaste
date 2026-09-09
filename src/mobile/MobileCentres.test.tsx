import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Centre, Experience } from '../api';
import type { JourneyHost } from '../channels/journeyHost';
import { MobileCentres } from './MobileCentres';
vi.mock('../map/useMapConfiguration', () => ({ useMapConfiguration: () => ({ configuration: { enabledControls: [] }, error: '', retry: vi.fn() }) }));
vi.mock('../map/LocationMapCanvas', () => ({ LocationMapCanvas: ({ centres, onSelect, details }: { centres: Centre[]; onSelect: (centre: Centre) => void; details: ReactNode }) => <div aria-label="Map results">{centres.map((c: Centre) => <button key={c.code} onClick={() => onSelect(c)}>{c.code}</button>)}{details}</div> }));
afterEach(cleanup);
const experience: Experience = { presentation: {}, categories: [], itemTypes: [], centres: [
  { code: 'alpha', name: { en: 'Alpha' }, city: 'Dubai', latitude: 25, longitude: 55 },
  { code: 'beta', name: { en: 'Beta' }, city: 'Sharjah', latitude: 26, longitude: 55 },
  { code: 'missing', name: { en: 'Unknown position' }, city: 'Dubai' },
] };
const makeHost = (): JourneyHost => ({ kind: 'telegram', permission: vi.fn().mockResolvedValue('prompt'), capture: vi.fn().mockResolvedValue({ latitude: 25, longitude: 55, accuracy: 10, capturedAt: Date.now() }), openMap: vi.fn() });
it('keeps markers and cards synchronized and clears stale selection when filtering', async () => {
  render(<MobileCentres experience={experience} host={makeHost()} onStart={vi.fn()}/>);
  expect(screen.getByText('3 of 3 found')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'beta' }));
  expect(screen.getByRole('button', { name: 'Close centre details' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search collection centres' }), { target: { value: 'Dubai' } });
  expect(screen.getByText('2 of 3 found')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'beta' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Close centre details' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Unknown position' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(screen.getByText('3 of 3 found')).toBeInTheDocument();
});
it('uses the host location only after a request and enables distance filters', async () => {
  const host = makeHost();
  render(<MobileCentres experience={experience} host={host} onStart={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByLabelText('Distance')).toBeDisabled();
  expect(host.capture).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
  await waitFor(() => expect(screen.getByLabelText('Distance')).toBeEnabled());
  expect(host.capture).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Sort by')).toHaveValue('distance');
  fireEvent.change(screen.getByLabelText('Distance'), { target: { value: '5' } });
  expect(screen.getByText('1 of 3 found')).toBeInTheDocument();
});
it('keeps manual discovery usable when location is denied', async () => {
  const host = makeHost(); vi.mocked(host.capture).mockRejectedValue(new Error('Denied'));
  render(<MobileCentres experience={experience} host={host} onStart={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Near me' }));
  await screen.findByText('Location was not shared. Search or choose a centre below.');
  expect(screen.getByText('3 of 3 found')).toBeInTheDocument();
});
