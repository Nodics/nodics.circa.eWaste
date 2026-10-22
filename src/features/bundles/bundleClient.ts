import { request, type Session } from "../../api";
import type { BundleOwner } from "../../BundleGifts";
import type { CertificateSelection } from "../../CertificatePicker";

export type { BundleOwner };
export type Page<T> = {
  ownerRef: BundleOwner;
  items: T[];
  page: number;
  limit: number;
  total: number;
};
export type CarbonLot = {
  lotCode: string;
  revision: number;
  unitOfMeasure: string;
  scale: number;
  state: "PROSPECTIVE" | "REALIZED";
  available: string;
  synthetic: boolean;
};
export type Component = {
  kind: "CERTIFICATE" | "REALIZED_CARBON";
  reference: { module: string; schema: string; code: string };
  quantity: string;
  expectedRevision: number;
  unitOfMeasure?: string;
};
export type ListingContext = {
  listingContextRef: { code: string; revision: number };
  storeCode: string;
  categoryCodes: string[];
  currency: string;
  priceBookCode: string;
  reward: { programCode: string; rewardTypeCode: string; scale: number };
};
export type CompositionContext = {
  ownerRef: BundleOwner;
  listings: {
    state: "AVAILABLE" | "DISABLED" | "UNAVAILABLE";
    items: (ListingContext & {
      code: string;
      revision: number;
      name: string;
    })[];
  };
};
export type ManifestCommand = {
  ownerRef: BundleOwner;
  components: Component[];
  idempotencyKey: string;
  composition?: CompositionInstruction;
};
export type CompositionInstruction =
  | { mode: "GIFT"; operationKey: string; recipientRef: BundleOwner }
  | { mode: "FIXED" | "AUCTION"; operationKey: string; terms: ListingTerms };
export type BundleReference = { manifestKey: string };
export const bundleReference = (value: unknown): value is BundleReference =>
  !!value &&
  typeof value === "object" &&
  Object.keys(value).join(",") === "manifestKey" &&
  typeof (value as BundleReference).manifestKey === "string" &&
  !!(value as BundleReference).manifestKey;
export type Manifest = { code: string; revision: number; digest: string };
export type ListingTerms = ListingContext & {
  saleMode: "FIXED" | "AUCTION";
  name: string;
  amount: string;
  startsAt: string | null;
  endsAt: string | null;
};
export type Intent = { manifest: ManifestCommand; operationKey: string } & (
  | { mode: "GIFT"; recipientRef: BundleOwner; recipientName: string }
  | { mode: "FIXED" | "AUCTION"; terms: ListingTerms }
);
export type Outcome = {
  code: string;
  status: "PENDING" | "COMPLETED" | "PUBLISHED" | "RELEASED";
  deadline?: string;
  productCode?: string;
  roundCode?: string;
};
export type CommandStatus = {
  status: string;
  canResume: boolean;
  outcome?: Outcome;
};

/** Exact server-owned history; absence never authorizes a new command, and explicit resume supplies no replacement intent. */
export async function recoverBundle(
  session: Session,
  ownerRef: BundleOwner,
  reference: BundleReference,
  resume = false,
): Promise<CommandStatus> {
  validateOwner(ownerRef, session);
  const row = object(
    await request<unknown>(
      "/nodics/digitalCore/v0/bundles/commands/" +
        (resume ? "resume" : "query"),
      session,
      { ownerRef, ...reference, ...(resume ? { confirmed: true } : {}) },
    ),
  );
  if (
    row.contractVersion !== 1 ||
    !sameOwner(row.ownerRef, ownerRef) ||
    row.manifestKey !== reference.manifestKey ||
    typeof row.canResume !== "boolean" ||
    ![
      "UNCONFIRMED",
      "PREPARED",
      "RESERVING",
      "HELD",
      "PENDING",
      "TRANSFERRING",
      "TRANSFERRED",
      "RELEASING",
      "RELEASED",
      "COMPLETED",
      "PUBLISHED",
    ].includes(String(row.status))
  )
    fail();
  const terminal = ["PENDING", "COMPLETED", "PUBLISHED", "RELEASED"].includes(
    String(row.status),
  );
  if (
    row.canResume === true &&
    !["PREPARED", "RESERVING", "HELD"].includes(String(row.status))
  )
    fail();
  if (!terminal)
    return { status: String(row.status), canResume: row.canResume as boolean };
  if (
    row.canResume !== false ||
    typeof row.code !== "string" ||
    !/^bundle-operation:[a-f0-9]{64}$/.test(row.code)
  )
    fail();
  if (row.status === "PUBLISHED") identifier(row.productCode);
  if (
    row.status === "PENDING" &&
    (typeof row.deadline !== "string" ||
      !Number.isFinite(Date.parse(row.deadline)))
  )
    fail();
  return {
    status: String(row.status),
    canResume: false,
    outcome: {
      code: row.code as string,
      status: row.status as Outcome["status"],
      ...(row.deadline ? { deadline: text(row.deadline) } : {}),
      ...(row.productCode ? { productCode: identifier(row.productCode) } : {}),
      ...(row.roundCode ? { roundCode: identifier(row.roundCode) } : {}),
    },
  };
}

const DIGITAL = "/nodics/digitalCore/v0";
const fail = (): never => {
  throw new Error("Owner evidence could not be confirmed.");
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return fail();
  return value;
}
function identifier(value: unknown): string {
  const result = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/.test(result)) return fail();
  return result;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    return fail();
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") return fail();
  return value;
}
export function sameOwner(value: unknown, owner: BundleOwner): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.module === owner.module &&
    row.schema === owner.schema &&
    row.code === owner.code
  );
}
export function validateOwner(owner: BundleOwner, session: Session) {
  if (
    owner.module !== "profile" ||
    !["customer", "enterprise"].includes(owner.schema)
  )
    fail();
  identifier(owner.code);
  if (
    !session.token ||
    session.kind === "EMPLOYEE" ||
    (session.kind === "ENTERPRISE"
      ? owner.schema !== "enterprise" || owner.code !== session.enterpriseCode
      : owner.schema !== "customer")
  )
    fail();
}
/** Exact decimal comparison is input validation only, never a wallet balance calculation. */
export function decimal(value: unknown, scale: number): string {
  if (
    !Number.isSafeInteger(scale) ||
    scale < 0 ||
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) ||
    (value.split(".")[1] || "").length > scale
  )
    return fail();
  return value;
}
export function positive(value: string): boolean {
  return /[1-9]/.test(value);
}
export function withinAvailable(
  quantity: string,
  available: string,
  scale: number,
): boolean {
  const [left, leftFraction = ""] = decimal(quantity, scale).split(".");
  const [right, rightFraction = ""] = decimal(available, scale).split(".");
  if (!positive(quantity)) return false;
  if (left!.length !== right!.length) return left!.length < right!.length;
  if (left !== right) return left! < right!;
  // Padding depends on actual supplied digits, never an owner-projected scale allocation.
  const width = Math.max(leftFraction.length, rightFraction.length);
  return leftFraction.padEnd(width, "0") <= rightFraction.padEnd(width, "0");
}
function parsePage<T>(
  raw: unknown,
  owner: BundleOwner,
  page: number,
  parse: (value: unknown) => T,
  code: (value: T) => string,
): Page<T> {
  const row = object(raw);
  if (
    !sameOwner(row.ownerRef, owner) ||
    row.page !== page ||
    !Array.isArray(row.items)
  )
    return fail();
  const limit = integer(row.limit),
    total = integer(row.total);
  if (
    !limit ||
    row.items.length > limit ||
    row.items.length > total ||
    row.items.length !==
      Math.min(limit, Math.max(0, total - (page - 1) * limit))
  )
    return fail();
  const items = row.items.map(parse);
  if (new Set(items.map(code)).size !== items.length) return fail();
  return { ownerRef: owner, items, page, limit, total };
}
/** Availability is an owner snapshot, not transferable qualification; Digital rechecks at reserve. */
export async function readCarbonHoldings(
  session: Session,
  ownerRef: BundleOwner,
  page: number,
  signal?: AbortSignal,
): Promise<Page<CarbonLot>> {
  validateOwner(ownerRef, session);
  const raw = await request<unknown>(
    "/nodics/wasteCarbon/v0/carbon/holdings",
    session,
    { page },
    "POST",
    { signal },
  );
  return parsePage(
    raw,
    ownerRef,
    page,
    (value) => {
      const row = object(value),
        scale = integer(row.scale);
      if (
        !["PROSPECTIVE", "REALIZED"].includes(String(row.state)) ||
        row.totalSpendable !== false ||
        row.eligibility !== "NOT_CHECKED" ||
        row.transferable !== null
      )
        return fail();
      for (const key of ["total", "prospective", "realized", "reserved"])
        decimal(row[key], scale);
      return {
        lotCode: identifier(row.lotCode),
        revision: integer(row.revision),
        unitOfMeasure: text(row.unitOfMeasure),
        scale,
        state: row.state as CarbonLot["state"],
        available: decimal(row.available, scale),
        synthetic: boolean(row.synthetic),
      };
    },
    (row) => row.lotCode,
  );
}
export function certificateComponent(row: CertificateSelection): Component {
  identifier(row.code);
  integer(row.revision);
  return {
    kind: "CERTIFICATE",
    reference: { module: "wasteCore", schema: "wasteAsset", code: row.code },
    quantity: "1",
    expectedRevision: row.revision,
  };
}
export function carbonComponent(row: CarbonLot, quantity: string): Component {
  if (
    row.state !== "REALIZED" ||
    !withinAvailable(quantity, row.available, row.scale)
  )
    fail();
  return {
    kind: "REALIZED_CARBON",
    reference: {
      module: "wasteCarbon",
      schema: "wasteCarbonLot",
      code: row.lotCode,
    },
    quantity,
    expectedRevision: row.revision,
    unitOfMeasure: row.unitOfMeasure,
  };
}
export function listingContext(value: ListingContext): ListingContext {
  const row = object(value),
    ref = object(row.listingContextRef),
    reward = object(row.reward),
    scale = integer(reward.scale);
  if (!Array.isArray(row.categoryCodes)) return fail();
  const categoryCodes = row.categoryCodes.map(identifier);
  if (new Set(categoryCodes).size !== categoryCodes.length) return fail();
  return {
    listingContextRef: {
      code: identifier(ref.code),
      revision: integer(ref.revision),
    },
    storeCode: identifier(row.storeCode),
    categoryCodes,
    currency: identifier(row.currency),
    priceBookCode: identifier(row.priceBookCode),
    reward: {
      programCode: identifier(reward.programCode),
      rewardTypeCode: identifier(reward.rewardTypeCode),
      scale,
    },
  };
}
/** Read-only owner projection. No inferred owner, business ID or automatically selected destination. */
export async function readCompositionContext(
  session: Session,
  signal?: AbortSignal,
): Promise<CompositionContext> {
  const row = object(
    await request<unknown>(
      DIGITAL + "/bundles/composition-context",
      session,
      {},
      "POST",
      { signal },
    ),
  );
  if (row.contractVersion !== 1) fail();
  const owner = object(row.ownerRef);
  const ownerRef = {
    module: owner.module,
    schema: owner.schema,
    code: identifier(owner.code),
  } as BundleOwner;
  validateOwner(ownerRef, session);
  const listings = object(row.listings);
  if (
    !["AVAILABLE", "DISABLED", "UNAVAILABLE"].includes(
      String(listings.state),
    ) ||
    !Array.isArray(listings.items)
  )
    fail();
  const items = (listings.items as unknown[]).map((value) => {
    const item = object(value);
    return {
      ...listingContext({
        ...item,
        listingContextRef: { code: item.code, revision: item.revision },
      } as ListingContext),
      code: identifier(item.code),
      revision: integer(item.revision),
      name: text(item.name),
    };
  });
  if (
    new Set(items.map((item) => item.code)).size !== items.length ||
    (listings.state !== "AVAILABLE" && items.length)
  )
    fail();
  return {
    ownerRef,
    listings: {
      state: listings.state as CompositionContext["listings"]["state"],
      items,
    },
  };
}
export function listingTerms(
  context: ListingContext,
  mode: "FIXED" | "AUCTION",
  name: string,
  amount: string,
  start: string,
  end: string,
): ListingTerms {
  const selected = listingContext(context);
  if (!positive(decimal(amount, selected.reward.scale))) fail();
  const date = (value: string) => {
    if (!value) return null;
    // datetime-local is user local time; only the wire representation is UTC.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) fail();
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.getTime())) fail();
    const [year, month, day, hour, minute, second = 0] = value
      .split(/[-T:]/)
      .map(Number);
    if (
      timestamp.getFullYear() !== year ||
      timestamp.getMonth() + 1 !== month ||
      timestamp.getDate() !== day ||
      timestamp.getHours() !== hour ||
      timestamp.getMinutes() !== minute ||
      timestamp.getSeconds() !== second
    )
      fail();
    return timestamp.toISOString();
  };
  const startsAt = date(start),
    endsAt = date(end);
  if (startsAt && endsAt && endsAt <= startsAt)
    throw new Error("End must follow start.");
  return {
    ...selected,
    saleMode: mode,
    name: text(name.trim()),
    amount,
    startsAt,
    endsAt,
  };
}
function componentSignature(value: unknown): string {
  const row = object(value),
    reference = object(row.reference);
  return JSON.stringify([
    row.kind,
    reference.module,
    reference.schema,
    reference.code,
    row.quantity,
    row.expectedRevision,
    row.unitOfMeasure ?? null,
  ]);
}
/** Each explicit recovery repeats the original create key and verifies retained contents before proceeding. */
export async function createManifest(
  session: Session,
  command: ManifestCommand,
): Promise<Manifest> {
  const row = object(
    await request<unknown>(DIGITAL + "/bundles", session, command),
  );
  if (
    row.status !== "ACTIVE" ||
    !sameOwner(row.ownerRef, command.ownerRef) ||
    row.idempotencyKey !== command.idempotencyKey ||
    !Array.isArray(row.components) ||
    row.components.length !== command.components.length ||
    JSON.stringify(row.components.map(componentSignature).sort()) !==
      JSON.stringify(command.components.map(componentSignature).sort()) ||
    typeof row.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.digest) ||
    typeof row.code !== "string" ||
    !/^bundle:[a-f0-9]{64}$/.test(row.code)
  )
    return fail();
  return {
    code: row.code,
    revision: integer(row.revision),
    digest: row.digest,
  };
}
/** No checkout, payment, pricing publication or component mutations are executed by this client. */
export async function submitIntent(
  session: Session,
  intent: Intent,
  manifest: Manifest,
): Promise<Outcome> {
  const base = {
    manifestCode: manifest.code,
    manifestRevision: manifest.revision,
    idempotencyKey: intent.operationKey,
    confirmed: true,
  };
  if (intent.mode === "GIFT") {
    const row = object(
      await request<unknown>(DIGITAL + "/gifts", session, {
        ...base,
        recipientRef: intent.recipientRef,
      }),
    );
    if (
      row.purpose !== "GIFT" ||
      !["PENDING", "COMPLETED"].includes(String(row.status)) ||
      row.manifestCode !== manifest.code ||
      row.manifestRevision !== manifest.revision ||
      row.idempotencyKey !== intent.operationKey ||
      !sameOwner(row.ownerRef, intent.manifest.ownerRef) ||
      !sameOwner(row.recipientRef, intent.recipientRef) ||
      object(row.evidence).manifestDigest !== manifest.digest ||
      typeof row.code !== "string" ||
      !/^bundle-operation:[a-f0-9]{64}$/.test(row.code) ||
      typeof row.deadline !== "string" ||
      !Number.isFinite(Date.parse(row.deadline))
    )
      return fail();
    integer(row.revision);
    return {
      code: row.code,
      status: row.status as "PENDING" | "COMPLETED",
      deadline: row.deadline,
    };
  }
  const row = object(
    await request<unknown>(DIGITAL + "/bundle-listings", session, {
      ...base,
      ...intent.terms,
    }),
  );
  if (
    row.confirmed !== true ||
    row.status !== "PUBLISHED" ||
    row.quantity !== "1" ||
    typeof row.operationCode !== "string" ||
    !/^bundle-operation:[a-f0-9]{64}$/.test(row.operationCode) ||
    row.publicationCode !== row.operationCode ||
    object(row.listingContextRef).code !==
      intent.terms.listingContextRef.code ||
    object(row.listingContextRef).revision !==
      intent.terms.listingContextRef.revision ||
    row.biddingMode !== intent.mode ||
    row.startsAt !== intent.terms.startsAt ||
    row.endsAt !== intent.terms.endsAt
  )
    return fail();
  const productCode = identifier(row.productCode);
  identifier(row.variantCode);
  identifier(row.sku);
  identifier(row.bindingCode);
  integer(row.versionId);
  let roundCode: string | undefined;
  if (intent.mode === "AUCTION") {
    const auction = object(row.auction);
    if (auction.storeCode !== intent.terms.storeCode) return fail();
    roundCode = identifier(auction.roundCode);
  }
  return {
    code: row.operationCode,
    status: "PUBLISHED",
    productCode,
    ...(roundCode ? { roundCode } : {}),
  };
}
