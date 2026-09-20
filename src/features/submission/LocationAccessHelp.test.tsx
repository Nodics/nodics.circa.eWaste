import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { JourneyHost } from '../../channels/journeyHost';
import { LocationAccessHelp } from './LocationAccessHelp';

afterEach(cleanup);
const host = (): JourneyHost => ({ kind: 'telegram', platform: 'macos', permission: async () => 'granted', capture: vi.fn(), openMap: vi.fn(), openLocationSettings: vi.fn() });
it('shows actionable Mac help instead of invoking an SDK no-op after an accuracy failure', () => {
  const adapter = host();
  render(<LocationAccessHelp host={adapter} permission="granted" hasError/>);
  expect(screen.queryByRole('button', {name:'Open Telegram permissions'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Location help'}));
  expect(screen.getByRole('region', {name:'Location help'})).toBeVisible();
  expect(screen.getByText('Telegram already has permission to use your location.')).toBeVisible();
  expect(screen.getByText(/System Settings → Privacy & Security → Location Services/)).toBeVisible();
  expect(adapter.openLocationSettings).not.toHaveBeenCalled();
  expect(adapter.capture).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name:'Location help'}));
  expect(screen.queryByRole('region', {name:'Location help'})).not.toBeInTheDocument();
});
it.each([false, true])('opens denied Telegram permissions with visible recovery if the SDK throws: %s', throws => {
  const adapter = host();
  if (throws) adapter.openLocationSettings = vi.fn(() => { throw Error('Unavailable'); });
  render(<LocationAccessHelp host={adapter} permission="denied" hasError/>);
  fireEvent.click(screen.getByRole('button', {name:'Open Telegram permissions'}));
  expect(adapter.openLocationSettings).toHaveBeenCalledOnce();
  expect(screen.getByText(/If nothing opens/)).toBeVisible();
  expect(adapter.capture).not.toHaveBeenCalled();
});
it('keeps unsupported clients on manual help without exposing a native settings action', () => {
  const adapter = host(); adapter.openLocationSettings = undefined;
  render(<LocationAccessHelp host={adapter} permission="unavailable" hasError/>);
  expect(screen.queryByRole('button', {name:'Open Telegram permissions'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Location help'}));
  expect(screen.getByRole('region', {name:'Location help'})).toBeVisible();
});
