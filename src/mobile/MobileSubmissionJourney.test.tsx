import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Experience } from '../api';
import type { JourneyHost } from '../channels/journeyHost';
import { useSubmissionJourney } from '../features/submission/useSubmissionJourney';
import { MobileSubmissionJourney } from './MobileSubmissionJourney';

vi.mock('../features/submission/useSubmissionJourney', () => ({ useSubmissionJourney: vi.fn() }));
type Journey = ReturnType<typeof useSubmissionJourney>;
let journey: Journey;
let host: JourneyHost;
let nativeBack: () => void;
const onExit = vi.fn();
const experience: Experience = { presentation: {}, categories: [], centres: [], itemTypes: [{ code: 'PHONE', name: { en: 'Phone' }, categoryCode: 'ELECTRONICS' }] };

beforeEach(() => {
  vi.clearAllMocks();
  journey = {
    draft: { code: 'saved-draft', revision: 1, submissionStatus: 'DRAFT', submittedFacts: {}, evidenceRefs: [], metadata: {} },
    arrival: null, permission: 'granted', busy: '', error: '', unsupportedItem: false, impactRecovery: false, preview: '', messages: [], ready: false, submitted: false,
    checkLocation: vi.fn(), upload: vi.fn(), retryAnalysis: vi.fn(), refreshImpact: vi.fn(), edit: vi.fn(), send: vi.fn(), confirm: vi.fn(), startNew: vi.fn(),
  };
  host = { kind: 'telegram', permission: vi.fn(), capture: vi.fn(), openMap: vi.fn(), setClosingConfirmation: vi.fn(), bindBack: handler => { nativeBack = handler; return vi.fn(); } };
  vi.mocked(useSubmissionJourney).mockImplementation(() => journey);
});
afterEach(cleanup);
function showJourney(review = false) {
  if (review) {
    journey.draft!.submittedFacts = { name: 'My phone', itemTypeCode: 'PHONE', categoryCode: 'ELECTRONICS', quantity: 1 };
    journey.draft!.evidenceRefs = [{ code: 'saved-photo' }];
    journey.arrival = { contractVersion: 1, draft: journey.draft!, nextAction: 'PHOTO', selectedCentre: null, centres: [], nearbyCentres: [], policy: { maximumPositionAgeMs: 60000, captureTimeoutMs: 15000 } };
    journey.ready = true;
  }
  render(<MobileSubmissionJourney session={{ loginId: 'test', token: 'test' }} experience={experience} host={host} onExit={onExit} onSubmitted={vi.fn()}/>);
}

it.each(['', 'Location is not precise enough.'])('leaves an empty saved draft immediately even after a location error: %s', error => {
  journey.error = error;
  showJourney();
  act(() => nativeBack());
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(false);
});

it('uses native Back to retrace saved progress and exit without a discard prompt', () => {
  showJourney(true);
  act(() => nativeBack());
  expect(screen.getByText('Let’s meet your item.')).toBeInTheDocument();
  act(() => nativeBack());
  expect(screen.getByText('Good things start nearby.')).toBeInTheDocument();
  act(() => nativeBack());
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(journey.draft!.evidenceRefs).toEqual([{ code: 'saved-photo' }]);
});

it('closes an unchanged editor without prompting or enabling native close confirmation', () => {
  showJourney(true);
  fireEvent.click(screen.getByRole('button', { name: 'Edit name and description' }));
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
  expect(screen.getByText('A better next step.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onExit).not.toHaveBeenCalled();
});

it('protects actual edits and discards only local changes after confirmation', () => {
  showJourney(true);
  fireEvent.click(screen.getByRole('button', { name: 'Edit name and description' }));
  fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Changed phone' } });
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(true);
  act(() => nativeBack());
  expect(screen.getByRole('dialog', { name: 'Discard these changes?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Item name')).toHaveValue('Changed phone');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
  expect(screen.getByText('My phone')).toBeInTheDocument();
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(false);
  expect(journey.edit).not.toHaveBeenCalled();
  expect(onExit).not.toHaveBeenCalled();
});

it('removes the prompt when edits are reverted to the displayed original values', () => {
  showJourney(true);
  fireEvent.click(screen.getByRole('button', { name: 'Edit name and description' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Changed' } });
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(true);
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } });
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(false);
  act(() => nativeBack());
  expect(screen.getByText('A better next step.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('offers starting another item separately from opening the submitted items', () => {
  journey.submitted = true;
  journey.draft!.submissionStatus = 'SUBMITTED';
  journey.draft!.submittedFacts.name = 'Submitted phone';
  showJourney();
  fireEvent.click(screen.getByRole('button', { name: 'Submit another item' }));
  expect(journey.startNew).toHaveBeenCalledTimes(1);
  expect(journey.confirm).not.toHaveBeenCalled();
  expect(onExit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View submissions' }));
  expect(onExit).toHaveBeenCalledTimes(1);
});

it('uses Telegram navigation without a second header and keeps help accessible', () => {
  showJourney();
  expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
  expect(screen.queryByText('Recycle an item')).not.toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Submission progress' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Get help' }));
  expect(screen.getByRole('heading', { name: 'How can we help?' })).toBeInTheDocument();
  act(() => nativeBack());
  expect(screen.queryByRole('heading', { name: 'How can we help?' })).not.toBeInTheDocument();
  expect(onExit).not.toHaveBeenCalled();
  act(() => nativeBack());
  expect(onExit).toHaveBeenCalledOnce();
});

it.each(['web', 'telegram'] as const)('retains in-page Back when %s has no native navigation', kind => {
  host = { ...host, kind, bindBack: undefined };
  showJourney();
  expect(screen.getByText('Recycle an item')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(onExit).toHaveBeenCalledOnce();
});

vi.mock('../map/useMapConfiguration', () => ({ useMapConfiguration: () => ({ configuration: null, error: '', retry: vi.fn() }) }));
it.each(['web', 'telegram'] as const)('keeps centre browsing and directions usable after %s location fails without bypassing arrival', kind => {
  host.kind = kind;
  host.permission = vi.fn(async () => 'denied' as const);
  if (kind === 'web') host.bindBack = undefined;
  journey.error = 'Your location is still too approximate to confirm arrival.';
  const centre = { code: 'du', name: { en: 'DU HQ - Dubai Hills' }, latitude: 25.106, longitude: 55.240 };
  render(<MobileSubmissionJourney experience={{ ...experience, centres: [centre] }} session={{ token: 'token', loginId: 'customer' }} host={host} onExit={onExit} onSubmitted={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Browse collection centres' }));
  expect(screen.getByRole('textbox', { name: 'Search collection centres' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Directions to DU HQ - Dubai Hills' }));
  expect(host.openMap).toHaveBeenCalledWith(expect.stringContaining('destination=25.106,55.24'));
  expect(journey.checkLocation).not.toHaveBeenCalled();
  expect(journey.upload).not.toHaveBeenCalled();
  expect(journey.confirm).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Item photo')).not.toBeInTheDocument();
  if (kind === 'telegram') act(() => nativeBack());
  else fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.getByRole('button', { name: 'Check location again' })).toBeVisible();
  expect(onExit).not.toHaveBeenCalled();
  expect(journey.startNew).not.toHaveBeenCalled();
  expect(journey.draft?.code).toBe('saved-draft');
});

it('routes an accuracy error to visible location help instead of a granted-permission settings no-op', () => {
  journey.error = 'Your location is still too approximate to confirm arrival.';
  host.platform = 'macos'; host.openLocationSettings = vi.fn();
  showJourney();
  expect(screen.queryByRole('button', {name:'Open location settings'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name:'Location help'}));
  expect(screen.getByText(/System Settings → Privacy & Security → Location Services/)).toBeVisible();
  expect(host.openLocationSettings).not.toHaveBeenCalled();
  expect(journey.checkLocation).not.toHaveBeenCalled();
});

it('describes unsupported items without asking for a clearer photo', () => {
 journey.unsupportedItem = true;
 journey.error = 'About your item: This looks like a plastic bottle. A yellow cap is visible. We can’t accept this item here.';
 journey.preview = 'data:image/png;base64,test';
 journey.arrival = { contractVersion: 1, draft: journey.draft!, nextAction: 'PHOTO', selectedCentre: null, centres: [], nearbyCentres: [], policy: { maximumPositionAgeMs: 60000, captureTimeoutMs: 15000 } };
 showJourney();
 expect(screen.getByRole('alert')).toHaveClass('mobile-item-not-accepted');
 expect(screen.getByRole('heading', {name:'We can’t accept this item'})).toBeInTheDocument();
 expect(screen.getByText('Take another item’s photo')).toBeInTheDocument();
 expect(screen.getByText(/This looks like a plastic bottle/)).toBeInTheDocument();
 expect(screen.queryByRole('button', {name:'Retry image analysis'})).not.toBeInTheDocument();
 expect(screen.getByText('Replace image')).toBeInTheDocument();
});
