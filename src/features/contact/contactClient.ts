/** Fixed Profile self-contact consumer; selectors, contact proof and transactional policy remain owner-authoritative. */
import { request, type Session } from "../../api";
export const contactPreferencesEnabled =
  import.meta.env.VITE_CIRCA_CONTACT_PREFERENCES_ENABLED === "true";
export const contactPresentationKeys = [
  "title",
  "inspectLabel",
  "emptyMessage",
  "workingLabel",
  "reviewTitle",
  "confirmLabel",
  "cancelLabel",
  "uncertainMessage",
  "unavailableMessage",
  "recordedMessage",
  "channelLabel",
  "purposeLabel",
  "ownerLabel",
  "verificationCodeLabel",
  "beginLabel",
  "verifyLabel",
  "consentLabel",
  "suppressionLabel",
  "grantedLabel",
  "suppressedLabel",
] as const;
export type ContactChannel = "EMAIL" | "SMS";
export interface ContactWorkspace {
  readonly ownerId: string;
  readonly channels: readonly ContactChannel[];
  readonly purposes: readonly {
    readonly code: string;
    readonly version: number;
    readonly channels: readonly ContactChannel[];
    readonly label: string;
  }[];
  readonly presentation: Readonly<
    Record<(typeof contactPresentationKeys)[number], string>
  >;
}
export interface ContactProgress {
  readonly revision: number;
  readonly status: string;
  readonly verified: boolean;
  readonly commandId?: string;
  readonly deliveryStatus?: string;
}
export type ContactDecision =
  | { readonly operation: "begin" }
  | { readonly operation: "verify"; readonly secret: string }
  | {
      readonly operation: "consent";
      readonly purpose: string;
      readonly granted: boolean;
      readonly operationReference: string;
    }
  | {
      readonly operation: "suppression";
      readonly purpose: string;
      readonly suppressed: boolean;
    };
export interface ContactCommand {
  readonly operation: ContactDecision["operation"];
  readonly body: Readonly<Record<string, string | number | boolean>>;
  readonly progress: ContactProgress;
}
const base = "/nodics/profile/v0/customer/contacts/verification/";
const fail = (): never => {
  throw new Error("The Profile contact response could not be confirmed.");
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const text = (value: unknown, maximum: number): string =>
  typeof value === "string" && value.trim() && value.length <= maximum
    ? value
    : fail();
const selector = (value: unknown): string =>
  typeof value === "string" && /^[A-Za-z0-9_.:@-]{1,128}$/.test(value)
    ? value
    : fail();
const revision = (value: unknown): number =>
  Number.isSafeInteger(value) &&
  Number(value) >= 0 &&
  Number(value) <= 2147483647
    ? Number(value)
    : fail();
const channels = (value: unknown): ContactChannel[] => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 2 ||
    new Set(value).size !== value.length ||
    value.some((channel) => channel !== "EMAIL" && channel !== "SMS")
  )
    return fail();
  return (value as unknown[]).map((channel) => channel as ContactChannel);
};
/** Projects only bounded inert self metadata; no address, login-to-ID inference or backend-policy fallback. */
export function parseContactWorkspace(value: unknown): ContactWorkspace {
  const data = record(value),
    copy = record(data.presentation);
  if (
    data.contractVersion !== 1 ||
    data.kind !== "PROFILE_VERIFIED_CONTACT_WORKSPACE" ||
    !Array.isArray(data.purposes) ||
    !data.purposes.length ||
    data.purposes.length > 32 ||
    Object.keys(data).sort().join(",") !==
      [
        "contractVersion",
        "kind",
        "ownerId",
        "channels",
        "purposes",
        "presentation",
      ]
        .sort()
        .join(",") ||
    Object.keys(copy).length !== contactPresentationKeys.length
  )
    return fail();
  const available = channels(data.channels),
    presentation = {} as Record<
      (typeof contactPresentationKeys)[number],
      string
    >;
  for (const key of contactPresentationKeys)
    presentation[key] = text(copy[key], key === "title" ? 160 : 500);
  const purposes = data.purposes.map((value) => {
    const row = record(value),
      admitted = channels(row.channels),
      version = revision(row.version);
    if (
      Object.keys(row).sort().join(",") !==
        ["code", "version", "channels", "label"].sort().join(",") ||
      !version ||
      admitted.some((channel) => !available.includes(channel))
    )
      return fail();
    return {
      code: selector(row.code),
      version,
      channels: admitted,
      label: text(row.label, 500),
    };
  });
  if (new Set(purposes.map((row) => row.code)).size !== purposes.length)
    return fail();
  if (
    available.some(
      (channel) =>
        !purposes.some((purpose) => purpose.channels.includes(channel)),
    )
  )
    return fail();
  return {
    ownerId: selector(data.ownerId),
    channels: available,
    purposes,
    presentation,
  };
}
/** Reads one fixed workspace without a submitted owner selector. Project visibility never qualifies the owner. */
export async function loadContactWorkspace(
  session: Session,
): Promise<ContactWorkspace> {
  if (!contactPreferencesEnabled) return fail();
  return parseContactWorkspace(await request(base + "workspace", session));
}
/** Projects content-free progress only; verification proof and delivery secrets cannot reach the UI. */
export function parseContactProgress(value: unknown): ContactProgress {
  const data = record(value),
    status = text(data.status, 128),
    rev = revision(data.revision);
  const allowed = [
    "revision",
    "status",
    "verified",
    "commandId",
    "deliveryStatus",
  ];
  if (
    Object.keys(data).some((key) => !allowed.includes(key)) ||
    typeof data.verified !== "boolean" ||
    ![
      "NOT_STARTED",
      "ISSUE_PENDING",
      "ISSUE_UNRECOVERABLE",
      "DELIVERY_PENDING",
      "ISSUED",
      "VERIFY_PENDING",
      "PROOF_READY",
      "CONSUME_PENDING",
      "VERIFIED",
    ].includes(status) ||
    data.verified !== (status === "VERIFIED")
  )
    return fail();
  if (
    status === "NOT_STARTED"
      ? rev !== 0 || data.commandId !== undefined
      : rev < 1 ||
        typeof data.commandId !== "string" ||
        !/^[a-f0-9]{64}$/.test(data.commandId)
  )
    return fail();
  if (
    data.deliveryStatus !== undefined &&
    (typeof data.deliveryStatus !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(data.deliveryStatus))
  )
    return fail();
  return {
    revision: rev,
    status,
    verified: data.verified,
    ...(data.commandId === undefined
      ? {}
      : { commandId: data.commandId as string }),
    ...(data.deliveryStatus === undefined
      ? {}
      : { deliveryStatus: text(data.deliveryStatus, 128) }),
  };
}
/** Explicit inspection of a published channel; the owner's held-checkpoint inspection never sends a new code. */
export async function inspectContact(
  session: Session,
  workspace: ContactWorkspace,
  channel: ContactChannel,
) {
  if (!contactPreferencesEnabled || !workspace.channels.includes(channel))
    return fail();
  return parseContactProgress(
    await request(base + "inspect", session, {
      ownerId: workspace.ownerId,
      channel,
    }),
  );
}
/** Freezes one reviewed owner/channel/revision command; every boolean is an explicit form choice, not prior state. */
export function prepareContactCommand(
  workspace: ContactWorkspace,
  channel: ContactChannel,
  progress: ContactProgress,
  decision: ContactDecision,
): ContactCommand {
  if (
    !contactPreferencesEnabled ||
    !workspace.channels.includes(channel) ||
    progress.revision >= 2147483647
  )
    return fail();
  const body: Record<string, string | number | boolean> = {
    ownerId: workspace.ownerId,
    channel,
    expectedRevision: progress.revision,
  };
  if (decision.operation === "begin") {
    if (!["NOT_STARTED", "VERIFIED"].includes(progress.status)) return fail();
  } else if (decision.operation === "verify") {
    if (
      progress.status !== "ISSUED" ||
      !progress.commandId ||
      !/^[a-f0-9]{12,128}$/.test(decision.secret)
    )
      return fail();
    body.commandId = progress.commandId;
    body.secret = decision.secret;
  } else {
    const publishedPurpose = workspace.purposes.find(
      (purpose) =>
        purpose.code === decision.purpose && purpose.channels.includes(channel),
    );
    if (!progress.revision || !publishedPurpose) return fail();
    body.purpose = decision.purpose;
    if (decision.operation === "consent") {
      if (
        typeof decision.granted !== "boolean" ||
        (decision.granted && progress.verified !== true)
      )
        return fail();
      body.granted = decision.granted;
      body.purposeVersion = publishedPurpose.version;
      body.operationReference = selector(decision.operationReference);
    } else {
      if (typeof decision.suppressed !== "boolean") return fail();
      body.suppressed = decision.suppressed;
    }
  }
  return Object.freeze({
    operation: decision.operation,
    body: Object.freeze(body),
    progress: Object.freeze({ ...progress }),
  });
}
/** Sends once, checks an actual owner receipt and never retries an uncertain command or retains its secret. */
export async function executeContactCommand(
  session: Session,
  command: ContactCommand,
) {
  if (!contactPreferencesEnabled) return fail();
  const fields = {
    begin: ["ownerId", "channel", "expectedRevision"],
    verify: ["ownerId", "channel", "expectedRevision", "commandId", "secret"],
    consent: [
      "ownerId",
      "channel",
      "expectedRevision",
      "purpose",
      "purposeVersion",
      "granted",
      "operationReference",
    ],
    suppression: [
      "ownerId",
      "channel",
      "expectedRevision",
      "purpose",
      "suppressed",
    ],
  };
  if (!Object.hasOwn(fields, command.operation)) return fail();
  const body = record(command.body),
    keys = fields[command.operation];
  if (
    Object.keys(body).sort().join(",") !== [...keys].sort().join(",") ||
    typeof body.channel !== "string" ||
    !["EMAIL", "SMS"].includes(body.channel) ||
    revision(body.expectedRevision) !== command.progress.revision ||
    command.progress.revision >= 2147483647
  )
    return fail();
  selector(body.ownerId);
  if (
    command.operation === "begin" &&
    !["NOT_STARTED", "VERIFIED"].includes(command.progress.status)
  )
    return fail();
  if (
    command.operation === "verify" &&
    (command.progress.status !== "ISSUED" ||
      body.commandId !== command.progress.commandId ||
      typeof body.commandId !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.commandId) ||
      typeof body.secret !== "string" ||
      !/^[a-f0-9]{12,128}$/.test(body.secret))
  )
    return fail();
  if (command.operation === "consent" || command.operation === "suppression") {
    selector(body.purpose);
    if (command.progress.revision < 1) return fail();
    if (command.operation === "consent") {
      if (revision(body.purposeVersion) < 1) return fail();
      selector(body.operationReference);
      if (
        typeof body.granted !== "boolean" ||
        (body.granted && command.progress.verified !== true)
      )
        return fail();
    } else if (typeof body.suppressed !== "boolean") return fail();
  }
  const projected = Object.fromEntries(keys.map((key) => [key, body[key]]));
  const result = record(
    await request(base + command.operation, session, projected),
  );
  if (command.operation === "begin" || command.operation === "verify") {
    const progress = parseContactProgress(result);
    if (
      progress.revision <= command.progress.revision ||
      (command.operation === "verify" &&
        progress.commandId !== command.progress.commandId)
    )
      return fail();
    return progress;
  }
  const field = command.operation === "consent" ? "granted" : "suppressed";
  const receiptKeys =
    command.operation === "consent"
      ? ["revision", "purpose", "purposeVersion", field]
      : ["revision", "purpose", field];
  if (
    Object.keys(result).sort().join(",") !== receiptKeys.sort().join(",") ||
    result.revision !== command.progress.revision + 1 ||
    result.purpose !== command.body.purpose ||
    (command.operation === "consent" &&
      result.purposeVersion !== command.body.purposeVersion) ||
    result[field] !== command.body[field]
  )
    return fail();
}
