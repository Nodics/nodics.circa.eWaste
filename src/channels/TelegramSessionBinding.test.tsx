import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '../api';
import { TelegramShell } from './TelegramShell';
const mocks = vi.hoisted(() => ({
  enter: vi.fn(), link: vi.fn(), save: vi.fn(),
  props: null as {session: Session | null; onLogin: (session: Session) => Promise<void>} | null,
}));
vi.mock('./channelAuthentication', () => ({enterChannel: mocks.enter, linkChannel: mocks.link}));
vi.mock('../api', () => ({APP_API:'/nodics/circa.ewaste/v0', request:vi.fn(async()=>({})), saveSession:mocks.save, setTelegramLaunch:vi.fn()}));
vi.mock('./journeyHost', () => ({telegramJourneyHost:()=>({kind:'telegram'})}));
vi.mock('../mobile/MobileLaunchScreen', () => ({MobileLaunchScreen:()=>null}));
vi.mock('../mobile/MobileApp', () => ({MobileApp:(props: NonNullable<typeof mocks.props>)=>{mocks.props=props;return <p>Mobile app</p>;}}));
beforeEach(()=>{
  vi.clearAllMocks();mocks.props=null;
  mocks.enter.mockResolvedValueOnce(null);
  mocks.link.mockResolvedValue(undefined);
  window.Telegram={WebApp:{initData:'fresh-launch',ready:vi.fn(),expand:vi.fn()}};
});
afterEach(()=>{cleanup();delete window.Telegram;});
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
