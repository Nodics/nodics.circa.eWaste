import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  pendingReferenceKey,
  readPendingReference,
  savePendingReference,
  clearPendingReference,
} from "./pendingReferences";
const session = {
  token: "secret-token",
  loginId: "actor",
  kind: "ENTERPRISE" as const,
  enterpriseCode: "company",
};
const owner = { ownerType: "ENTERPRISE", ownerCode: "company" };
const key = pendingReferenceKey(session, "test-capability", owner, "offer");
type Ref = { operationKey: string };
const validate = (v: unknown): v is Ref =>
  !!v &&
  typeof v === "object" &&
  Object.keys(v).join(",") === "operationKey" &&
  typeof (v as Ref).operationKey === "string";
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
it("keys retain actor, canonical owner, capability and offer scope without credentials or revisions", () => {
  expect(
    pendingReferenceKey(
      { ...session, token: "refreshed" },
      "test-capability",
      owner,
      "offer",
    ),
  ).toBe(key);
  expect(key).not.toContain(session.token);
  expect(
    pendingReferenceKey(
      { ...session, loginId: "other" },
      "test-capability",
      owner,
      "offer",
    ),
  ).not.toBe(key);
  expect(
    pendingReferenceKey(
      session,
      "test-capability",
      { ...owner, ownerCode: "other" },
      "offer",
    ),
  ).not.toBe(key);
  expect(pendingReferenceKey(session, "other", owner, "offer")).not.toBe(key);
  expect(
    pendingReferenceKey(session, "test-capability", owner, "other"),
  ).not.toBe(key);
});
it("roundtrips only validated hints and refuses silently replacing an unresolved command", () => {
  expect(readPendingReference(key, validate)).toBeNull();
  savePendingReference(key, { operationKey: "original" }, validate);
  savePendingReference(key, { operationKey: "original" }, validate);
  expect(readPendingReference(key, validate)).toEqual({
    operationKey: "original",
  });
  expect(() =>
    savePendingReference(key, { operationKey: "new" }, validate),
  ).toThrow(/original operation/);
  expect(() =>
    clearPendingReference(key, { operationKey: "new" }, validate),
  ).toThrow(/changed/);
  clearPendingReference(key, { operationKey: "original" }, validate);
  savePendingReference(key, { operationKey: "legitimate-next" }, validate);
});
it.each(["{", '{"operationKey":"original","token":"secret"}', "null"])(
  "corrupt or caller-schema-rejected hints fail closed: %s",
  (raw) => {
    sessionStorage.setItem(key, raw);
    expect(() => readPendingReference(key, validate)).toThrow(/cannot be read/);
    expect(() =>
      savePendingReference(key, { operationKey: "replacement" }, validate),
    ).toThrow();
  },
);
it("quota and denied storage throw instead of pretending dispatch can proceed", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  expect(() =>
    savePendingReference(key, { operationKey: "original" }, validate),
  ).toThrow(/Nothing new was sent/);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw Error("denied");
  });
  expect(() => readPendingReference(key, validate)).toThrow(/cannot be read/);
});
it("failed clear retains the resolved reference for another owner status check", () => {
  savePendingReference(key, { operationKey: "original" }, validate);
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw Error("denied");
  });
  expect(() =>
    clearPendingReference(key, { operationKey: "original" }, validate),
  ).toThrow(/could not be cleared/);
  expect(readPendingReference(key, validate)).toEqual({
    operationKey: "original",
  });
});
