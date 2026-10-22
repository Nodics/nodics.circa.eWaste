import type { Session } from "./api";

export type ReferenceValidator<T> = (value: unknown) => value is T;
export type ReferenceOwner = { ownerType: string; ownerCode: string };

/** Same actor/owner survives refreshed credentials; another actor, owner or task never inherits a hint. */
export function pendingReferenceKey(
  session: Session,
  capability: string,
  owner?: ReferenceOwner,
  scope?: string,
): string {
  return (
    "circa.pending.reference:" +
    JSON.stringify([
      session.kind ?? "CUSTOMER",
      session.loginId,
      session.enterpriseCode ?? null,
      owner?.ownerType ?? null,
      owner?.ownerCode ?? null,
      capability,
      scope ?? null,
    ])
  );
}

/** Caller-validated minimal original command hints, not authority. Bounded quote inputs may retain original IDs/amount/key for same-key retry.
 * Callers must exclude credentials, external account mappings and ledger/balance/rate snapshots; this helper does not police domain semantics.
 * Backend owners reauthorize every read/retry and resolve authoritative state.
 */
export function readPendingReference<T>(
  key: string,
  validate: ReferenceValidator<T>,
): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!validate(value)) throw new Error("Invalid reference");
    return value;
  } catch {
    throw new Error(
      "The original operation reference cannot be read. Restore browser storage before continuing.",
    );
  }
}

/** Must succeed before dispatch. An existing different command cannot be silently replaced. */
export function savePendingReference<T>(
  key: string,
  reference: T,
  validate: ReferenceValidator<T>,
): void {
  if (!validate(reference))
    throw new Error("Invalid original operation reference.");
  const previous = readPendingReference(key, validate),
    encoded = JSON.stringify(reference);
  if (previous !== null && JSON.stringify(previous) !== encoded)
    throw new Error("Check the original operation before starting another.");
  try {
    sessionStorage.setItem(key, encoded);
    if (sessionStorage.getItem(key) !== encoded)
      throw new Error("Reference was not retained");
  } catch {
    throw new Error(
      "The original operation reference cannot be saved. Nothing new was sent.",
    );
  }
}

/** Call only after owner-confirmed resolution. A late reply must not clear a newer command. */
export function clearPendingReference<T>(
  key: string,
  expected: T,
  validate: ReferenceValidator<T>,
): void {
  if (!validate(expected))
    throw new Error("Invalid original operation reference.");
  const current = readPendingReference(key, validate);
  if (current === null) return;
  if (JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error(
      "The original operation reference changed. Check its status before continuing.",
    );
  try {
    sessionStorage.removeItem(key);
    if (sessionStorage.getItem(key) !== null)
      throw new Error("Reference was not cleared");
  } catch {
    throw new Error(
      "The operation resolved, but its reference could not be cleared. Check it again before continuing.",
    );
  }
}
