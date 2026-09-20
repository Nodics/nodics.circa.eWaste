import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSubmissionJourney } from "./useSubmissionJourney";
import { request, type Submission } from "../../api";
import type { JourneyHost } from "../../channels/journeyHost";
vi.mock("../../api", async () => ({
  ...(await vi.importActual("../../api")),
  request: vi.fn(),
}));
let draft: Submission, host: JourneyHost, calls: string[];
const session = { loginId: "journey@example.test", token: "test" };
beforeEach(() => {
  sessionStorage.clear();
  calls = [];
  draft = {
    code: "d1",
    revision: 1,
    submissionStatus: "AWAITING_SUBMITTER_CONFIRMATION",
    submittedFacts: {
      name: "Phone",
      itemTypeCode: "PHONE",
      categoryCode: "PHONE",
      quantity: 1,
      preferredCollectionPointCode: "c1",
    },
    evidenceRefs: [{ code: "photo" }],
    metadata: {},
  };
  sessionStorage.setItem("circa.draft." + session.loginId, draft.code);
  host = {
    kind: "web",
    permission: vi.fn(async () => "granted" as const),
    capture: vi.fn(async () => ({
      latitude: 25,
      longitude: 55,
      accuracy: 5,
      capturedAt: Date.now(),
    })),
    openMap: vi.fn(),
  };
  vi.mocked(request).mockImplementation(async (path, _session, body) => {
    calls.push(path);
    const data = body as { expectedRevision?: number };
    if (path.endsWith("/arrival")) {
      draft = { ...draft, revision: draft.revision + 1 };
      return {
        draft,
        nextAction: "PHOTO",
        selectedCentre: { code: "c1" },
        centres: [],
        nearbyCentres: [],
      };
    }
    if (path.endsWith("/messages")) {
      expect(data.expectedRevision).toBe(draft.revision);
      draft = { ...draft, revision: draft.revision + 1 };
      return { draft, changed: false, message: "Rewards are reviewed later." };
    }
    if (path.endsWith("/confirm")) {
      draft = {
        ...draft,
        revision: draft.revision + 1,
        submissionStatus: "SUBMITTED",
      };
      return draft;
    }
    return draft;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("a side question leaves the latest reviewed draft ready and never confirms", async () => {
  const { result } = renderHook(() =>
    useSubmissionJourney({ session, open: true, host, onSubmitted: vi.fn() }),
  );
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => {
    await result.current.send("When do I get rewards?");
  });
  expect(result.current.ready).toBe(true);
  expect(result.current.draft?.revision).toBe(3);
  expect(calls.some((x) => x.endsWith("/confirm"))).toBe(false);
});
it("a lost confirmation response reconciles the durable receipt without another submit", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  vi.mocked(request).mockImplementation(async (...args) => {
    if (args[0].endsWith("/confirm")) {
      await original(...args);
      throw Error("Network response lost");
    }
    return original(...args);
  });
  const { result } = renderHook(() =>
    useSubmissionJourney({ session, open: true, host, onSubmitted: vi.fn() }),
  );
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() => result.current.confirm());
  expect(result.current.submitted).toBe(true);
  expect(calls.filter((x) => x.endsWith("/confirm"))).toHaveLength(1);
});
it("an older location callback cannot create a draft after logout", async () => {
  let resolvePermission: (permission: "granted") => void = () => {};
  host.permission = () =>
    new Promise((resolve) => {
      resolvePermission = resolve;
    });
  const { result, rerender } = renderHook(
    ({ activeSession }) =>
      useSubmissionJourney({
        session: activeSession,
        open: true,
        host,
        onSubmitted: vi.fn(),
      }),
    { initialProps: { activeSession: session as typeof session | null } },
  );
  rerender({ activeSession: null });
  await act(async () => resolvePermission("granted"));
  expect(result.current.draft).toBeNull();
  expect(host.capture).not.toHaveBeenCalled();
});
it("outside arrival does not upload media or send confirmation", async () => {
  const original = vi.mocked(request).getMockImplementation()!;
  let checks = 0;
  vi.mocked(request).mockImplementation(async (...args) => {
    const result = await original(...args);
    if (args[0].endsWith("/arrival") && ++checks > 1)
      return { ...(result as object), nextAction: "TRAVEL" };
    return result;
  });
  const fetcher = vi.spyOn(globalThis, "fetch");
  const { result } = renderHook(() =>
    useSubmissionJourney({ session, open: true, host, onSubmitted: vi.fn() }),
  );
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() =>
    result.current.upload(
      new File(["image"], "image.png", { type: "image/png" }),
    ),
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(result.current.arrival?.nextAction).toBe("TRAVEL");
  expect(result.current.ready).toBe(false);
});
it("failed native location initialization leaves a retryable screen and preserves the existing draft", async () => {
  host.permission = vi.fn(async () => {
    throw new Error("Location initialization timed out");
  });
  const { result } = renderHook(() =>
    useSubmissionJourney({ session, open: true, host, onSubmitted: vi.fn() }),
  );
  await waitFor(() => expect(result.current.error).toContain("timed out"));
  expect(result.current.permission).toBe("unknown");
  expect(result.current.busy).toBe("");
  expect(result.current.draft?.code).toBe("d1");
  await act(() => result.current.checkLocation());
  expect(result.current.arrival?.nextAction).toBe("PHOTO");
});

it("recognition failure retains the photo and allows explicit correction without resubmitting", async () => {
  draft = { ...draft, submissionStatus: "MEDIA_STAGED", submittedFacts: { quantity: 1, preferredCollectionPointCode: "c1" } };
  const original = vi.mocked(request).getMockImplementation()!;
  const { ApiError } = await import('../../api');
  vi.mocked(request).mockImplementation(async (...args) => {
    if (args[0].endsWith('/analyze')) throw new ApiError('Recognition invalid: The item is unclear', 'ERR_WASTE_RECOGNITION_INVALID');
    if (args[3] === 'PATCH') draft = { ...draft, revision: draft.revision + 1, submittedFacts: { ...draft.submittedFacts, ...(args[2] as object) } };
    return original(...args);
  });
  const { result } = renderHook(() => useSubmissionJourney({ session, open: true, host, onSubmitted: vi.fn() }));
  await waitFor(() => expect(result.current.busy).toBe(''));
  await act(async () => { await result.current.retryAnalysis(); });
  expect(result.current.error).toContain('Your photo is saved');
  expect(result.current.error).not.toContain('Recognition invalid');
  expect(result.current.ready).toBe(false);
  expect(result.current.draft?.evidenceRefs).toEqual([{ code: 'photo' }]);
  await act(async () => { await result.current.edit({ name: 'Remote control', itemTypeCode: 'GENERIC_DEVICE', categoryCode: 'MIXED', quantity: 1 }); });
  expect(result.current.ready).toBe(true);
  expect(result.current.error).toBe('');
  expect(result.current.draft?.submittedFacts.name).toBe('Remote control');
  expect(calls.some(path => path.endsWith('/confirm'))).toBe(false);
});

it("desktop accuracy recovery uses a fresh capture and keeps the saved draft/photo", async () => {
  const { ApiError } = await import("../../api");
  const original = vi.mocked(request).getMockImplementation()!;
  let rejectArrival = true;
  vi.mocked(request).mockImplementation(async (...args) => {
    if (args[0].endsWith("/arrival") && rejectArrival)
      throw new ApiError("Location accuracy unavailable: technical detail", "ERR_CIRCA_POSITION_ACCURACY_REQUIRED");
    return original(...args);
  });
  const { result } = renderHook(() => useSubmissionJourney({ session, open: true, host, maximumAccuracyMetres: 50, maximumPositionAgeMs: 60000, onSubmitted: vi.fn() }));
  await waitFor(() => expect(result.current.error).toContain("Enable location access for your browser or Telegram"));
  expect(result.current.error).not.toContain("technical detail");
  expect(result.current.arrival).toBeNull();
  expect(result.current.draft?.evidenceRefs).toEqual([{ code: "photo" }]);
  expect(sessionStorage.getItem("circa.draft." + session.loginId)).toBe("d1");
  rejectArrival = false;
  await act(() => result.current.checkLocation("c1"));
  expect(host.capture).toHaveBeenCalledTimes(2);
  expect(host.capture).toHaveBeenLastCalledWith(expect.any(AbortSignal), 12000, { maximumAccuracyMetres: 50, maximumPositionAgeMs: 60000 });
  expect(result.current.error).toBe("");
  expect(result.current.arrival?.nextAction).toBe("PHOTO");
  expect(calls.some(path => path.endsWith("/confirm"))).toBe(false);
});
