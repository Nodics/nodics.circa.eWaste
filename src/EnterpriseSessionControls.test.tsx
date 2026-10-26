import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EnterpriseSessionControls } from './EnterpriseSessionControls';
const session = { kind: 'ENTERPRISE' as const, token: 'access', loginId: 'staff', enterpriseCode: 'company' };
const reply = (data: unknown) => new Response(JSON.stringify({ data }));
const availability = (discovery: boolean, switching = discovery) => ({ featureAvailability: {
  profile: { contractVersion: 1, features: { enterpriseMembershipDiscovery: discovery, enterpriseMembershipSwitch: switching } },
} });
const mount = () => render(<EnterpriseSessionControls session={session} onSwitch={vi.fn()} />);
afterEach(() => vi.restoreAllMocks());
it.each([[false, false], [true, false]])('hides switching for owner availability %s/%s without membership request', async (discovery, switching) => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(availability(discovery, switching)));
  mount(); await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(screen.getByText('company')).toBeInTheDocument();
  expect(screen.queryByLabelText('Switch Enterprise')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(fetch.mock.calls[0][0]).toBe('/nodics/backoffice/v0/bootstrap/public');
  expect(fetch.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { 'x-nodics-client-contract-version': '1' } });
});
it('renders an enabled empty membership result only after workspace success', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(availability(true))).mockResolvedValueOnce(reply({
    contractVersion: 1, owner: 'profile', renderer: 'axis.enterprise-memberships', enterpriseCode: 'company', items: [],
  }));
  mount(); await screen.findByText('No other accepted Enterprise memberships.');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([{}, { featureAvailability: { profile: { contractVersion: 9, features: {} } } }, availability(false, true)])('rejects missing or malformed availability', async data => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(data));
  mount(); await screen.findByRole('alert'); expect(fetch).toHaveBeenCalledOnce();
  expect(screen.queryByText('No other accepted Enterprise memberships.')).not.toBeInTheDocument();
});
it.each(['denied', 'network', 'malformed'])('preserves %s workspace failure after availability', async kind => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(availability(true)));
  if (kind === 'network') fetch.mockRejectedValueOnce(new Error('offline'));
  else fetch.mockResolvedValueOnce(kind === 'denied' ? new Response(JSON.stringify({ code: 'ERR_AUTH_00003' }), { status: 403 }) : reply({}));
  mount(); await screen.findByRole('alert');
  expect(screen.queryByText('No other accepted Enterprise memberships.')).not.toBeInTheDocument();
});
