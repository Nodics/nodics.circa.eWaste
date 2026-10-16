import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError, type Session } from '../api';
import { TelegramShell } from './TelegramShell';
const mocks = vi.hoisted(() => ({
  enter: vi.fn(), link: vi.fn(), save: vi.fn(),
  props: null as {session: Session | null; onLogin: (session: Session) => Promise<void>} | null,
}));
vi.mock('./channelAuthentication', () => ({enterChannel: mocks.enter, linkChannel: mocks.link}));
vi.mock('../api', async (original) => {
  const actual = await original<typeof import('../api')>();
  return {...actual, APP_API:'/nodics/eWaste/v0', request:vi.fn(async()=>({})), saveSession:mocks.save, setTelegramLaunch:vi.fn()};
});
vi.mock('./journeyHost', () => ({telegramJourneyHost:()=>({kind:'telegram'})}));
vi.mock('../mobile/MobileLaunchScreen', () => ({MobileLaunchScreen:()=>null}));
vi.mock('../mobile/MobileApp', () => ({MobileApp:(props: NonNullable<typeof mocks.props>)=>{mocks.props=props;return <p>Mobile app</p>;}}));
beforeEach(()=>{
  vi.clearAllMocks();mocks.props=null;
  mocks.enter.mockResolvedValueOnce(null);
  mocks.link.mockResolvedValue(undefined);
  window.Telegram={WebApp:{initData:'fresh-launch',ready:vi.fn(),expand:vi.fn()}};
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();delete window.Telegram;});
it('exchanges password sign-in for a channel-bound session before continuing',async()=>{
  const password={loginId:'customer',token:'password-access'};
  const bound={loginId:'customer',token:'channel-bound-access'};
  mocks.enter.mockResolvedValueOnce(bound);
  render(<TelegramShell/>);
  await waitFor(()=>expect(mocks.props).not.toBeNull());
  await act(async()=>{await mocks.props!.onLogin(password);});
  expect(mocks.link).toHaveBeenCalledWith('TELEGRAM','fresh-launch',password);
  expect(mocks.enter).toHaveBeenCalledTimes(2);
  expect(mocks.save).toHaveBeenLastCalledWith(bound);
  expect(mocks.props!.session).toEqual(bound);
});
it('does not continue if the post-link exchange resolves a different account',async()=>{
  mocks.enter.mockResolvedValueOnce({loginId:'other',token:'other-access'});
  render(<TelegramShell/>);
  await waitFor(()=>expect(mocks.props).not.toBeNull());
  await expect(mocks.props!.onLogin({loginId:'customer',token:'password-access'})).rejects.toThrow('Telegram session could not be completed');
  expect(mocks.props!.session).toBeNull();
  expect(mocks.save).toHaveBeenLastCalledWith(null);
});
it('shows configuration-required recovery without retrying when Telegram is unconfigured',async()=>{
  mocks.enter.mockReset();
  mocks.enter.mockRejectedValueOnce(
    new ApiError('Telegram configuration is required', 'TELEGRAM_CONFIGURATION_REQUIRED'),
  );
  render(<TelegramShell/>);
  await screen.findByRole('heading', { name: 'Configuration required.' });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Telegram access is not configured',
  );
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

it.each(['ERR_EWASTE_CHANNEL_CONFIGURATION_REQUIRED', 'ERR_PROFILE_TELEGRAM_CONFIGURATION_REQUIRED'])(
  'uses the actual HTTP error envelope %s for configuration recovery without retry or session admission', async code => {
    const actual = await vi.importActual<typeof import('../api')>('../api');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      responseCode: '503', code, name: 'NodicsError',
      message: 'Administrator configuration is required.',
    }, { status: 503 })));
    mocks.enter.mockReset();
    mocks.enter.mockImplementation(() => actual.request('/nodics/eWaste/v0/authentication/channels/TELEGRAM/entry', null, { proof: 'synthetic-launch' }));
    render(<TelegramShell/>);
    await screen.findByRole('heading', { name: 'Configuration required.' });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(mocks.enter).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  },
);

it.each(['ERR_EWASTE_CHANNEL_UNAVAILABLE', 'ERR_NETWORK_TIMEOUT', 'ERR_EWASTE_CHANNEL_IDENTITY'])(
  'does not infer configuration state from message text for %s', async code => {
    mocks.enter.mockReset();
    mocks.enter.mockRejectedValueOnce(new ApiError('UNCONFIGURED TELEGRAM_CONFIGURATION_REQUIRED', code));
    render(<TelegramShell/>);
    await screen.findByRole('heading', { name: 'Let’s reconnect.' });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(mocks.enter).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  },
);
