/** Authored contract fixtures only; behavioral execution remains joint. */
import { afterEach, expect, it, vi } from "vitest";
import { request } from "./api";
import {
  acceptParticipation,
  parseParticipationWorkspace,
  switchParticipation,
  withdrawParticipation,
} from "./employeeParticipationClient";
import { participationFixture } from "./participationFixtures";
vi.mock("./api", () => ({ request: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const proof = {
  kind: "EMPLOYEE" as const,
  token: "employee-only",
  loginId: "fixture-employee",
};
it("rejects unsupported versions, targets, missing owner copy and malformed consent state", () => {
  for (const value of [
    { ...participationFixture, contractVersion: 2 },
    { ...participationFixture, enterpriseCode: "other" },
    { ...participationFixture, presentation: {} },
    {
      ...participationFixture,
      participation: { phase: "COMPLETE", revision: 0 },
    },
  ])
    expect(() => parseParticipationWorkspace(value)).toThrow();
});
it("sends exact current terms and checks the next participation revision", async () => {
  vi.mocked(request).mockResolvedValueOnce({
    enterpriseCode: "default",
    accepted: true,
    revision: 1,
  });
  await acceptParticipation(
    proof,
    parseParticipationWorkspace(participationFixture),
  );
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "/nodics/profile/v0/customer/participation/accept",
    proof,
    {
      termsVersion: participationFixture.terms.version,
      termsDigest: participationFixture.terms.digest,
      accepted: true,
    },
  );
  vi.mocked(request).mockResolvedValueOnce({
    enterpriseCode: "default",
    phase: "WITHDRAWN",
    revision: 3,
  });
  await expect(
    withdrawParticipation(
      proof,
      parseParticipationWorkspace({
        ...participationFixture,
        participation: {
          phase: "COMPLETE",
          revision: 1,
          currentTerms: true,
          canSwitch: true,
        },
      }),
    ),
  ).rejects.toThrow();
});
it("switches only the reviewed revision and projects only returned Customer proof", async () => {
  const workspace = parseParticipationWorkspace({
    ...participationFixture,
    participation: {
      phase: "COMPLETE",
      revision: 1,
      currentTerms: true,
      canSwitch: true,
    },
  });
  vi.mocked(request).mockResolvedValueOnce({
    authToken: "customer-only",
    loginId: "fixture-customer",
    enterpriseCode: "default",
    groups: ["staff"],
    employeeToken: proof.token,
  });
  expect(await switchParticipation(proof, workspace)).toEqual({
    token: "customer-only",
    loginId: "fixture-customer",
  });
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "/nodics/profile/v0/employee/browser/customer-participation/switch",
    proof,
    { revision: 1 },
  );
  vi.mocked(request).mockResolvedValueOnce({
    authToken: "wrong",
    loginId: "fixture",
    enterpriseCode: "other",
  });
  await expect(switchParticipation(proof, workspace)).rejects.toThrow();
});
it("rejects implicit switch permission and does not renew already-current terms", async () => {
  const participation = {
    phase: "COMPLETE",
    revision: 2,
    currentTerms: true,
    canSwitch: false,
  };
  const workspace = parseParticipationWorkspace({
    ...participationFixture,
    participation,
  });
  await expect(acceptParticipation(proof, workspace)).rejects.toThrow();
  await expect(switchParticipation(proof, workspace)).rejects.toThrow();
  expect(() =>
    parseParticipationWorkspace({
      ...participationFixture,
      participation: { ...participation, canSwitch: undefined },
    }),
  ).toThrow();
  expect(request).not.toHaveBeenCalled();
});
