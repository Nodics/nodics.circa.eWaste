import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, request, type Submission } from "../../api";
import { useSubmissionJourney } from "./useSubmissionJourney";
import type { JourneyHost } from "../../channels/journeyHost";
vi.mock("../../api", async (original) => ({ ...(await original<typeof import("../../api")>()), request: vi.fn() }));
const session = { loginId: "preparation@example.test", token: "token" };
const host: JourneyHost = { kind: "web", permission: async () => "granted", capture: async () => ({ latitude: 25, longitude: 55, accuracy: 5, capturedAt: Date.now() }), openMap: () => {} };
const arrival = { draft: null, nextAction: "PHOTO", selectedCentre: { code: "CENTRE" } };
beforeEach(() => {
  sessionStorage.clear(); vi.mocked(request).mockReset();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() }));
  vi.mocked(request).mockImplementation(async path => {
    if (path.endsWith("/journey/arrival")) return arrival;
    throw new Error("Unexpected request " + path);
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => renderHook(() => useSubmissionJourney({ session, open: true, host, onSubmitted: vi.fn() }));
it("checks location and exits without creating a draft or uploading Media", async () => {
  const { result, unmount } = show();
  await waitFor(() => expect(result.current.arrival?.nextAction).toBe("PHOTO"));
  expect(result.current.draft).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
  expect(vi.mocked(request).mock.calls[0][0]).toBe("/nodics/eWaste/v0/journey/arrival");
  unmount();
  expect(sessionStorage.getItem("circa.draft." + session.loginId)).toBeNull();
});
it("keeps a failed photo temporary and exposes no saved draft", async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path.endsWith("/journey/arrival")) return arrival;
    throw new ApiError("This photo is unclear", "ERR_WASTE_RECOGNITION_INVALID");
  });
  const { result } = show();
  await waitFor(() => expect(result.current.busy).toBe(""));
  await act(async () => { await result.current.upload(new File(["photo"], "item.png", { type: "image/png" })); });
  expect(result.current.draft).toBeNull();
  expect(result.current.ready).toBe(false);
  expect(result.current.error).toBe("This photo is unclear");
  expect(sessionStorage.getItem("circa.draft." + session.loginId)).toBeNull();
  expect(vi.mocked(request).mock.calls.every(([path]) => path.endsWith("/journey/arrival") || path.endsWith("/submissions/prepare"))).toBe(true);
});

it("uses a fresh preparation reference when replacing an unsaved failed photo", async () => {
  vi.mocked(request).mockImplementation(async path => {
    if (path.endsWith("/journey/arrival")) return arrival;
    throw new ApiError("This photo is unclear", "ERR_WASTE_RECOGNITION_INVALID");
  });
  const { result } = show();
  await waitFor(() => expect(result.current.busy).toBe(""));
  await act(async () => { await result.current.upload(new File(["photo-a"], "item-a.png", { type: "image/png" })); });
  await act(async () => { await result.current.upload(new File(["photo-b"], "item-b.png", { type: "image/png" })); });
  const prepareBodies = vi.mocked(request).mock.calls
    .filter(([path]) => path.endsWith("/submissions/prepare"))
    .map(([, , body]) => body as { idempotencyKey: string });
  expect(prepareBodies).toHaveLength(2);
  expect(prepareBodies[1].idempotencyKey).not.toBe(prepareBodies[0].idempotencyKey);
  expect(result.current.draft).toBeNull();
  expect(sessionStorage.getItem("circa.draft." + session.loginId)).toBeNull();
});

it("persists only the successful preparation response for resume", async () => {
  vi.mocked(request).mockImplementation(async path => path.endsWith("/journey/arrival") ? arrival : {
    code: "prepared", revision: 1, submissionStatus: "METADATA_SUGGESTED", evidenceRefs: [{ code: "evidence" }],
    submittedFacts: { name: "Phone", itemTypeCode: "PHONE" }, metadata: {},
  });
  const { result } = show();
  await waitFor(() => expect(result.current.busy).toBe(""));
  await act(async () => { await result.current.upload(new File(["photo"], "item.png", { type: "image/png" })); });
  expect(result.current.ready).toBe(true);
  expect(sessionStorage.getItem("circa.draft." + session.loginId)).toBe("prepared");
});
it("cancels an in-flight preparation when the customer leaves", async () => {
  let signal: AbortSignal | undefined;
  vi.mocked(request).mockImplementation(async (path, _session, _body, _method, options) => {
    if (path.endsWith("/journey/arrival")) return arrival;
    signal = options?.signal;
    return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError"))));
  });
  const { result, unmount } = show();
  await waitFor(() => expect(result.current.busy).toBe(""));
  let pending: Promise<unknown>;
  act(() => { pending = result.current.upload(new File(["photo"], "item.png", { type: "image/png" })); });
  await waitFor(() => expect(signal).toBeDefined());
  unmount();
  await pending!;
  expect(signal?.aborted).toBe(true);
  expect(sessionStorage.getItem("circa.draft." + session.loginId)).toBeNull();
});

it("prepares a separate item after a receipt without replaying or changing the submitted item", async () => {
  const submitted = {code:"completed", revision:3, submissionStatus:"SUBMITTED", submittedFacts:{name:"Old phone",itemTypeCode:"PHONE"}, metadata:{}, evidenceRefs:[]};
  const next = {...submitted,code:"next-draft",revision:1,submissionStatus:"METADATA_SUGGESTED",evidenceRefs:[{code:"new-photo"}]};
  sessionStorage.setItem("circa.draft." + session.loginId + ".create", "previous-command");
  vi.mocked(request).mockImplementation(async path => {
    if (path.endsWith("/submissions/completed")) return submitted;
    if (path.endsWith("/journey/arrival")) return arrival;
    if (path.endsWith("/submissions/prepare")) return next;
    throw new Error("Unexpected request " + path);
  });
  const {result} = renderHook(() => useSubmissionJourney({session,open:true,host,resumeCode:"completed",onSubmitted:vi.fn()}));
  await waitFor(() => expect(result.current.submitted).toBe(true));
  await waitFor(() => expect(result.current.busy).toBe(""));
  act(() => result.current.startNew());
  await waitFor(() => expect(result.current.busy).toBe(""));
  expect(result.current.draft).toBeNull();
  expect(result.current.submitted).toBe(false);
  await act(async () => {await result.current.upload(new File(["photo"],"new-item.png",{type:"image/png"}));});
  expect(result.current.draft?.code).toBe("next-draft");
  const prepare = vi.mocked(request).mock.calls.find(([path]) => path.endsWith("/submissions/prepare"));
  expect(prepare?.[2]).toMatchObject({expectedRevision:undefined});
  expect((prepare?.[2] as {idempotencyKey:string}).idempotencyKey).not.toBe("previous-command");
  expect(vi.mocked(request).mock.calls.filter(([path]) => path.includes("/submissions/completed"))).toHaveLength(1);
  expect(vi.mocked(request).mock.calls.some(([path]) => path.endsWith("/confirm"))).toBe(false);
});

it("refreshes an existing estimate at the latest revision without uploading or confirming", async () => {
 const draft={code:"charger",revision:2,submissionStatus:"METADATA_SUGGESTED",submittedFacts:{name:"Charger"},metadata:{},evidenceRefs:[{code:"E"}]};
 vi.mocked(request).mockImplementation(async path => path.endsWith("/journey/arrival") ? arrival : draft);
 const {result}=show();
 await waitFor(()=>expect(result.current.busy).toBe(""));
 await act(async()=>{await result.current.upload(new File(["photo"],"item.png",{type:"image/png"}));});
 vi.mocked(request).mockClear();
 await act(async()=>{await result.current.refreshImpact();});
 expect(vi.mocked(request).mock.calls.map(c=>c[0])).toEqual(["/nodics/eWaste/v0/submissions/charger","/nodics/eWaste/v0/submissions/charger/estimate"]);
 expect(vi.mocked(request).mock.calls[1][2]).toMatchObject({expectedRevision:2});
 expect(result.current.ready).toBe(true);
});

it("flags an impact estimate failure as impact recovery and retries the saved draft estimate", async () => {
 let draft: Submission={code:"bundle",revision:4,submissionStatus:"METADATA_SUGGESTED",submittedFacts:{name:"Cable bundle",itemTypeCode:"UNKNOWN_ELECTRONIC_ITEM"},metadata:{suggestion:{facts:{name:"Cable bundle"},advisory:true,confidence:"0.9"},photo:{code:"P"}},evidenceRefs:[{code:"E"}]};
 let estimateAttempts=0;
 vi.mocked(request).mockImplementation(async path => {
   if (path.endsWith("/journey/arrival")) return arrival;
   if (path.endsWith("/submissions/bundle/estimate")) {
     estimateAttempts++;
     if (estimateAttempts === 1) throw new ApiError("Update the environmental impact assessment before submitting. Your photo and details are saved.", "ERR_WASTE_IMPACT_INPUT_INVALID");
     draft={...draft,revision:5,metadata:{...draft.metadata,estimate:{code:"impact"}}};
     return draft;
   }
   if (path.endsWith("/submissions/bundle")) return draft;
   throw new Error("Unexpected request " + path);
 });
 sessionStorage.setItem("circa.draft." + session.loginId, "bundle");
 const {result}=show();
 await waitFor(()=>expect(result.current.draft?.code).toBe("bundle"));
 await act(async()=>{await result.current.refreshImpact();});
 expect(result.current.impactRecovery).toBe(true);
 await act(async()=>{await result.current.refreshImpact();});
 expect(estimateAttempts).toBe(2);
 expect(result.current.impactRecovery).toBe(false);
 expect(result.current.ready).toBe(true);
});
