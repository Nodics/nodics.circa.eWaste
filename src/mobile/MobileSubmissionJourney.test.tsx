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
    arrival: null, permission: 'granted', busy: '', error: '', preview: '', messages: [], ready: false, submitted: false,
    checkLocation: vi.fn(), upload: vi.fn(), retryAnalysis: vi.fn(), edit: vi.fn(), send: vi.fn(), confirm: vi.fn(), startNew: vi.fn(),
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
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel editing' }));
  expect(screen.getByText('Ready for a second life.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onExit).not.toHaveBeenCalled();
});

it('protects actual edits and discards only local changes after confirmation', () => {
  showJourney(true);
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Changed' } });
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(true);
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } });
  expect(host.setClosingConfirmation).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.getByText('Ready for a second life.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
