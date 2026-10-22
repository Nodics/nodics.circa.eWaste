/** Participant transport; all balances, ownership and draft revisions are server-authoritative. */
export type Facts = {
  submissionUnit?: "BUNDLE";
  name?: string;
  description?: string;
  categoryCode?: string;
  itemTypeCode?: string;
  conditionGrade?: string;
  quantity?: number;
  preferredCollectionPointCode?: string;
  sizeClass?: "SMALL" | "MEDIUM" | "LARGE" | "BULKY" | "HEAVY" | "UNKNOWN";
  weight?: string;
  brand?: string;
  model?: string;
};
export type Ref = { code: string; module?: string; schema?: string };
export type EnvironmentalIndicator = {
  key: string;
  metricCode: string;
  label: string;
  unitOfMeasure: string;
  value: string | null;
  status:
    | "NOT_ASSESSED"
    | "ILLUSTRATIVE"
    | "ESTIMATED"
    | "CONFIRMED"
    | "RECALCULATED"
    | "FAILED";
  basis: string | null;
  requirements: string[];
  reason: string | null;
};
export type EnvironmentalAssessment = {
  contractVersion: number;
  mappingVersion: string;
  status: EnvironmentalIndicator["status"];
  assessedAt: string;
  publicClaimAllowed: false;
  indicators: EnvironmentalIndicator[];
  metricEvidence?: { metricCode: string; min: number; max: number; sourceUrl: string; explanation: string }[];
  inputs?: {
    weightKg?: number;
    weightSource?: string;
    quantity?: number;
    defaultUnitWeightKg?: number;
    weightMinKg?: number;
    weightMaxKg?: number;
    weightBasis?: string;
    weightConfidence?: number;
    itemTypeCode?: string;
    categoryCode?: string;
  };
  factors?: {
    factorKgCO2ePerKg?: number;
    factorSource?: string;
    factorSetVersion?: string;
    savingsMinKgCO2e?: number;
    savingsMaxKgCO2e?: number;
    energyMinKWh?: number;
    energyMaxKWh?: number;
    baselineFactor?: number;
    treatmentFactor?: number;
    sourceFactorUnit?: string;
  };
  methodology: {
    formulaVersion: string | null;
    profileCode: string;
    providerCode: string | null;
    providerVersion?: string;
    assessmentBasis?: string;
    assessmentLimitation?: string;
    referenceScenarioVersion?: string;
    referenceScenarioExplanation?: string;
    weightReference?: string;
    weightReferenceUrl?: string;
    comparisonReferenceUrl?: string;
    isMock: boolean;
    methodologyRef?: string;
    factorDatasetRef?: string;
    assessmentRef?: string;
    geography?: string;
    baselineScenario?: string;
    treatmentScenario?: string;
    systemBoundary?: string;
    referenceYear?: string | number;
  };
  carbonCredits: {
    status: "NOT_ASSESSED";
    issuedQuantity: null;
    registryReference: null;
    reason: string;
  };
};
export type DescriptorRange = {
  min: number | null;
  max: number | null;
  unit: string;
  basis: string;
  confidence?: number | null;
};
export type ItemDescriptor = {
  evidenceReview?: {
    manualApprovalRequired: boolean;
    manualApprovalRecorded: boolean;
    label: string;
    message: string | null;
    customerMessage?: string;
    reason: string | null;
    sourceLabel: string;
    qualityFlags?: string[];
  };
  contractVersion: 1;
  code: string;
  status: string;
  stage: string;
  requiresClassificationReview?: boolean;
  identity: {
    name: string | null;
    description: string | null;
    brand: string | null;
    model: string | null;
  };
  classification: Record<
    "family" | "category" | "itemType",
    { code: string | null; name: { en?: string } | string | null }
  >;
  physical: {
    quantity: number | null;
    size: { value: string; basis: string; confidence?: number | null };
    weight: { value: string | null; unit: string; basis: string };
    weightEstimate: DescriptorRange;
    dimensionsEstimate: Record<
      "length" | "width" | "height",
      DescriptorRange
    > | null;
  };
  materials: {
    ref: Ref;
    name: { en?: string } | string | null;
    kind: string;
    basis: string;
    confidence: number | null;
    visibility?: string;
    recoverability?: string;
  }[];
  components?: {
    ref: Ref;
    name: { en?: string } | string | null;
    basis: string;
    confidence: number | null;
    hazardRelevant?: boolean | null;
    recoveryRelevant?: boolean | null;
  }[];
  condition: { value: string; basis: string };
  environment: {
    assessment: EnvironmentalAssessment | null;
    carbonImpact?: {
      status: EnvironmentalIndicator["status"];
      indicators: EnvironmentalIndicator[];
      assessedAt: string | null;
    };
    landfillDiversion?: {
      value: string | null;
      unit: string;
      basis: string;
      status: EnvironmentalIndicator["status"];
      confidence?: number | null;
    };
    provisional: boolean;
    observations: {
      recyclability: { value: string; basis: string };
      contamination: { value: string; basis: string };
      recoveryPotential: { value: string; basis: string };
      hazards: { code: string; basis: string }[];
    };
  };
  reward?: {
    estimatedReward: { rewardTypeCode?: string; amount?: string }[];
    rewardStatus: string;
    rewardCalculationVersion: string | null;
    rewardCalculationBasis: string | null;
  };
  metadataQuality?: {
    unknownFields: string[];
    lowConfidenceFields: string[];
    manualVerificationRequired: boolean;
    completenessScore: number | null;
  };
  review: {
    decision: string | null;
    comment: string | null;
    reviewedAt: string | null;
  };
};
export type Submission = {
  descriptor?: ItemDescriptor;
  code: string;
  revision: number;
  submissionStatus: string;
  submittedFacts: Facts;
  confirmedFacts?: Facts;
  evidenceRefs?: Ref[];
  metadata: {
    origin?: { channel: string; allowsWrite?: boolean };
    arrival?: {
      collectionPointCode: string;
      position: {
        latitude: number;
        longitude: number;
        accuracy: number | null;
        capturedAt: number;
      };
      checkedAt: number;
    };
    reviewAssignment?: { status: string; queueCode?: string; label?: string };
    depositInstruction?: string;
    estimatePending?: boolean;
    conversation?: { role: "assistant" | "user"; text: string }[];
    photo?: { code: string; url?: string };
    estimate?: {
      metadata?: { environmentalAssessment?: EnvironmentalAssessment };
      estimatedCarbonKg?: number;
      carbonKg?: number;
      [key: string]: unknown;
    };
    suggestion?: {
      facts: Facts;
      advisory: boolean;
      confidence: string;
      recognition?: {
        contractVersion: number;
        taxonomyMatch?: {
          kind: "EXACT" | "GENERIC_FALLBACK";
          itemTypeCode: string;
          categoryCode: string;
        };
        materials: { ref: Ref; basis: string; confidence: number }[];
        weight: { value: number | null; unit: string; basis: string };
        size: { value: string; basis: string; policyVersion: string | null };
        unknownFields: string[];
        qualityFlags: string[];
      };
    };
    publicReason?: string;
    submittedAt?: string;
    reviewedAt?: string;
  };
};
export type Asset = {
  descriptor?: ItemDescriptor;
  code: string;
  revision: number;
  assetStatus: string;
  ownerRef: Ref;
  sourceSubmissionCode: string;
  metadata: {
    facts: Facts;
    photo?: { code?: string; url?: string };
    openingReward?: number;
    confirmedReward?: {
      rewardTypeCode: string;
      rewardAmount: string;
    };
    rewardSettlement?: {
      assessmentCode: string;
      walletCode?: string;
      ledgerEntryCode?: string;
      rewardTypeCode: string;
      rewardAmount: string;
      policyCode: string;
      policyVersion: number;
      settledAt: string;
    };
    valuation?: {
      pointsRewardTypeCode: string;
      rewards: { rewardTypeCode: string; amount: string }[];
    };
    illustrativeCarbonUnits?: number;
    settlementStatus?: string;
    commerceProductRef?: Ref;
    listingIdempotencyKey?: string;
    pendingTransferEvent?: { idempotencyKey: string; transferType: string };
    askingPrice?: number;
  };
};
export type Centre = {
  distanceMetres?: number;

  countryCode?: string;
  operatorEnterpriseName?: string;
  collectionPointType?: string;
  serviceCapabilities?: string[];
  code: string;
  name: { en: string };
  addressLine?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  metadata?: { hours?: string; acceptedCategoryCodes?: string[] };
  acceptanceSummary?: { en: string };
  location?: { latitude: number; longitude: number };
};
export type ItemType = {
  code: string;
  name: { en: string };
  categoryCode: string;
  allowedConditionGrades?: string[];
};
export type Experience = {
  journey?: {
    contractVersion: number;
    arrivalRadiusMetres: number;
    maximumPositionAgeMs: number;
    maximumAccuracyMetres?: number;
    captureTimeoutMs: number;
  };
  presentation: {
    sampleMode?: boolean;
    heroImages?: string[];
    [key: string]: unknown;
  };
  categories: { code: string; name: { en: string } }[];
  itemTypes: ItemType[];
  centres: Centre[];
};
export type Account = {
  customer: { code: string; loginId: string };
  submissions: Submission[];
  assets: Asset[];
  events: {
    code: string;
    assetCode?: string;
    transferType?: string;
    transferStatus?: string;
    occurredAt?: string;
  }[];
};
export type Wallet = {
  wallet: { code: string; ownerCode?: string };
  balances: { rewardTypeCode: string; available: string; reserved: string }[];
  entries: {
    code: string;
    entryType: string;
    amount: string;
    rewardTypeCode: string;
    postedAt: string;
    sourceCode: string;
  }[];
};
export type Offer = {
  gallery?: { url: string; alt?: string }[];
  category?: { code: string; label: string } | null;
  condition?: string | null;
  available?: boolean;
  terms?: string[];
  eligibility?: string[];
  exclusions?: string[];
  redemptionInstructions?: string[];
  purchaseConditions?: string[];
  saleMode?: string;
  descriptor?: ItemDescriptor;
  code: string;
  name: string;
  issuer?: string;
  imageUrl?: string;
  rewardPrice: string | number;
  commerce?: {
    storeCode: string;
    currency: string;
    jurisdiction: string;
    locale: string;
    programCode: string;
    rewardTypeCode: string;
    variantCode: string;
  };
  acquisitionRequirements?: {
    type: "REWARDS" | "CERTIFICATES" | "BOTH";
    certificates?: {
      quantity: number;
      categoryCode?: string;
      brandCodes?: string[];
      modelCodes?: string[];
      milestoneCode?: string;
    };
  } | null;
  bundleRef?: { module: string; schema: string; code: string };
  listingWindow?: { startsAt?: string; endsAt?: string };
  ownerRef?: { module: "profile"; schema: "customer" | "enterprise"; code: string };
  biddingAvailable?: boolean;
  biddingMode?: "AUCTION" | "NEGOTIATION";
  auction?: { roundCode: string; storeCode: string };
  carbonUnits?: number;
  ownerCode?: string;
  kind: "ASSET" | "COUPON";
  description?: string;
  expiresAt?: string;
  assetCode?: string;
  revision: number | string;
};
export type Market = { assets: Offer[]; coupons: Offer[] };
/** EMPLOYEE is transient personal-participation proof, never an admitted Circa session. */
export type Session = { token: string; loginId: string; kind?: "CUSTOMER" | "EMPLOYEE" | "ENTERPRISE"; enterpriseCode?: string };
export type EnterpriseSession = Session & { kind: "ENTERPRISE"; enterpriseCode: string };
export function isEnterpriseSession(session?: Session | null): session is EnterpriseSession {
  return session?.kind === "ENTERPRISE";
}
export const API = "/nodics/eWaste/v0";
export const APP_API = "/nodics/eWaste/v0";
/** Projects nested owner envelopes without discarding explicit failure evidence. */
export function unwrap<T>(value: unknown): T {
  let item = value as Record<string, unknown>;
  for (let i = 0; i < 6 && item && !Array.isArray(item); i++) {
    if (
      item.success === false ||
      (typeof item.code === "string" && item.code.startsWith("ERR_"))
    )
      throw new ApiError("The owner response could not be confirmed.");
    if (item.data !== undefined) item = item.data as Record<string, unknown>;
    else if (item.result !== undefined)
      item = item.result as Record<string, unknown>;
    else break;
  }
  return item as T;
}
let telegramLaunch: string | null = null;
/** Keeps launch data in memory only; it is never customer authentication authority. */
export function setTelegramLaunch(value: string | null) {
  telegramLaunch = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
/** Identifies expired or unresolved customer browser credentials without weakening domain authorization. */
export function isCustomerIdentityError(cause: unknown): boolean {
  if (!(cause instanceof ApiError)) return false;
  return [
    "ERR_AUTH_00001",
    "ERR_WASTE_CUSTOMER_REQUIRED",
    "ERR_MEDIA_CUSTOMER_REQUIRED",
  ].includes(cause.code || "");
}
export async function request<T>(
  path: string,
  session?: Session | null,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  options: { timeoutMs?: number; signal?: AbortSignal; enterpriseCode?: string } = {},
): Promise<T> {
  if (session && (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") ||
      new URL(path, window.location.origin).origin !== window.location.origin ||
      new URL(path, window.location.origin).pathname !== path.split(/[?#]/)[0]))
    throw new ApiError("The requested service is unavailable.");
  if (isEnterpriseSession(session) && !session.enterpriseCode)
    throw new ApiError("Enterprise context is unavailable.");
  const employeeBrowser = path.startsWith("/nodics/profile/v0/employee/browser/");
  if (options.enterpriseCode !== undefined && (!employeeBrowser || session && session.enterpriseCode !== options.enterpriseCode))
    throw new ApiError("The requested session context does not match.");
  const enterpriseCode = session?.enterpriseCode ?? options.enterpriseCode ?? "default";
  if (!/^[A-Za-z0-9_.:@|-]{1,200}$/.test(enterpriseCode)) throw new ApiError("Enterprise context is unavailable.");
  if (isEnterpriseSession(session) && (/^\/nodics\/eWaste\/v0(?:[/?#]|$)/.test(path) ||
      path.startsWith("/nodics/profile/v0/customer/") || path.includes("/customer-participation/") || /^\/nodics\/commsApi\/v0\/inbox(?:[/?#]|$)/.test(path)))
    throw new ApiError("This action requires a personal Customer session.", "ERR_CIRCA_PERSONAL_SESSION_REQUIRED");
  const switching =
    path === "/nodics/profile/v0/employee/browser/customer-participation/switch";
  const csrf =
    switching || employeeBrowser
      ? employeeCsrf()
      : path.startsWith("/nodics/profile/v0/customer/browser/")
        ? customerCsrf()
        : "";
  if (switching && (!csrf || !session))
    throw new ApiError("The Employee browser session could not be confirmed.");
  if (employeeBrowser && !path.endsWith("/authenticate") && !csrf)
    throw new ApiError("The Employee browser session could not be confirmed.");
  let idempotencyKey: string | undefined;
  if (!["GET", "HEAD"].includes(method.toUpperCase()) && body && typeof body === "object" &&
      !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, "idempotencyKey")) {
    const supplied = (body as Record<string, unknown>).idempotencyKey;
    if (typeof supplied === "string") {
      // Header transport must not trim, encode or replace the caller's mutation identity.
      if (!supplied || supplied.trim() !== supplied || /[^\x20-\x7e]/.test(supplied))
        throw new ApiError("The supplied idempotency key is not safe for header transport.");
      idempotencyKey = supplied;
    }
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 60000,
  );
  let response: Response, envelope;
  try {
    response = await fetch(path, {
      method,
      signal: controller.signal,
      credentials: "same-origin",
      ...(employeeBrowser ? { cache: "no-store" as const, redirect: "error" as const } : {}),
      headers: {
        "Content-Type": "application/json",
        "x-enterprise-code": enterpriseCode,
        ...(idempotencyKey !== undefined ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(csrf ? { "x-csrf-token": csrf } : {}),
        ...(telegramLaunch && !isEnterpriseSession(session) && !employeeBrowser
          ? { "x-ewaste-telegram-launch": telegramLaunch }
          : {}),
        ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    try {
      envelope = await response.json();
    } catch (cause) {
      if (controller.signal.aborted) throw cause;
      throw new ApiError(
        "The service is temporarily unavailable. Please retry.",
      );
    }
  } catch (cause) {
    if (options.signal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new ApiError(
        "The connection is taking too long. Please try again; your saved progress is retained.",
        "ERR_NETWORK_TIMEOUT",
      );
    if (cause instanceof ApiError) throw cause;
    throw new ApiError(
      "We couldn’t connect. Check your internet connection and try again.",
      "ERR_NETWORK_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
  if (
    !response.ok ||
    envelope.success === false ||
    String(envelope.code || "").startsWith("ERR_")
  )
    throw new ApiError(
      envelope.message ||
        `Request failed (${response.status}). Please try again.`,
      envelope.code,
    );
  return unwrap<T>(envelope);
}

let memorySession: Session | null = null;
let sessionGeneration = 0;
let restoringSession: Promise<Session | null> | null = null;
/** Returns the non-secret CSRF companion to Profile's HttpOnly refresh cookie. */
function customerCsrf(): string {
  const value = document.cookie
    .split(";")
    .map((v) => v.trim())
    .find((v) =>
      v.startsWith(
        `${import.meta.env.VITE_CUSTOMER_CSRF_COOKIE_NAME || "nodics_customer_csrf"}=`,
      ),
    );
  return value ? decodeURIComponent(value.slice(value.indexOf("=") + 1)) : "";
}
/** Reads only the declared Employee CSRF companion; never substitutes Customer cookie proof. */
function employeeCsrf(): string {
  const name = import.meta.env.VITE_EMPLOYEE_CSRF_COOKIE_NAME || "nodics_axis_csrf";
  const value = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(name + "="));
  try { return value ? decodeURIComponent(value.slice(value.indexOf("=") + 1)) : ""; }
  catch { return ""; }
}
const enterpriseHintKey = "circa.enterprise-session";
/** An untrusted non-secret routing hint; only Profile can restore/admit the associated session. */
export function enterpriseSessionHint(): string | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(enterpriseHintKey) || "null");
    return typeof value === "string" && /^[A-Za-z0-9_.:@|-]{1,200}$/.test(value) ? value : null;
  } catch { return null; }
}
/** Access credentials live only in memory; discard the legacy browser-storage copy. */
export function readSession(): Session | null {
  sessionStorage.removeItem("circa.session");
  return memorySession;
}
export function saveSession(session: Session | null) {
  if (session?.kind === "EMPLOYEE" || isEnterpriseSession(session) && !/^[A-Za-z0-9_.:@|-]{1,200}$/.test(session.enterpriseCode || ""))
    throw new ApiError("The session could not be confirmed.");
  sessionStorage.removeItem("circa.session");
  if (isEnterpriseSession(session)) sessionStorage.setItem(enterpriseHintKey, JSON.stringify(session.enterpriseCode));
  else sessionStorage.removeItem(enterpriseHintKey);
  sessionGeneration++;
  memorySession = session ? Object.freeze({ ...session }) : null;
}
/** Deduplicates cookie rotation and discards restoration that finishes after logout or a newer login. */
export function restoreSession(options: { allowEnterprise?: boolean } = {}): Promise<Session | null> {
  const enterprise = enterpriseSessionHint();
  // Personal/mobile/channel hosts must explicitly opt into Enterprise presentation.
  if (enterprise && !options.allowEnterprise) return Promise.resolve(null);
  if (restoringSession) return restoringSession;
  if (enterprise) {
    if (!employeeCsrf()) { saveSession(null); return Promise.resolve(null); }
    const generation = sessionGeneration;
    restoringSession = request<unknown>("/nodics/profile/v0/employee/browser/restore", null, {}, "POST", { enterpriseCode: enterprise })
      .then(value => confirmEnterpriseSession(value, enterprise))
      .then(value => {
        if (generation !== sessionGeneration) return memorySession;
        saveSession(value); return value;
      }).catch(cause => {
        if (generation !== sessionGeneration) return memorySession;
        saveSession(null); throw cause;
      }).finally(() => { restoringSession = null; });
    return restoringSession;
  }
  if (!customerCsrf()) return Promise.resolve(readSession());
  const generation = sessionGeneration;
  restoringSession = request<{ authToken?: string; loginId?: string }>(
    "/nodics/profile/v0/customer/browser/restore",
    null,
    {},
  )
    .then((auth) => {
      if (generation !== sessionGeneration) return memorySession;
      const session =
        auth.authToken && auth.loginId
          ? { token: auth.authToken, loginId: auth.loginId }
          : null;
      saveSession(session);
      return session;
    })
    .finally(() => {
      restoringSession = null;
    });
  return restoringSession;
}
/** Clears memory immediately and revokes the server-owned refresh credential. */
export async function endSession(): Promise<void> {
  const enterprise = isEnterpriseSession(memorySession) ? memorySession.enterpriseCode : enterpriseSessionHint();
  saveSession(null);
  if (enterprise) {
    if (!employeeCsrf()) throw new ApiError("Enterprise sign-out could not be confirmed. Sign in again.");
    await request("/nodics/profile/v0/employee/browser/logout", null, {}, "POST", { enterpriseCode: enterprise });
    return;
  }
  if (customerCsrf())
    await request("/nodics/profile/v0/customer/browser/logout", null, {});
}

function sessionRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("Profile session evidence could not be confirmed.");
  return value as Record<string, unknown>;
}
function sessionText(value: unknown, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError("Profile session evidence could not be confirmed.");
  return value;
}
/** Verifies the issued human access token at Profile; never decodes claims or computes domain permissions in the browser. */
async function confirmEnterpriseSession(value: unknown, enterpriseCode: string): Promise<EnterpriseSession> {
  const auth = sessionRecord(value);
  const token = sessionText(auth.authToken, 32768);
  if (auth.enterpriseCode !== undefined && auth.enterpriseCode !== enterpriseCode)
    throw new ApiError("Profile returned a different Enterprise context.");
  const provisional: EnterpriseSession = { kind: "ENTERPRISE", token, loginId: "", enterpriseCode };
  const scopes = sessionRecord(await request("/nodics/profile/v0/identity/scopes/me", provisional));
  if (scopes.principalType !== "human" || !Array.isArray(scopes.scopes) || !Array.isArray(scopes.deniedScopes))
    throw new ApiError("The current Employee scope could not be confirmed.");
  const loginId = sessionText(scopes.principalCode, 320);
  if (auth.loginId !== undefined && auth.loginId !== loginId)
    throw new ApiError("Profile returned a different Employee identity.");
  return Object.freeze({ ...provisional, loginId });
}
/** Fresh PASSWORD sign-in, distinct from personal Employee-to-Customer participation. */
export async function authenticateEnterpriseSession(enterpriseCode: string, loginId: string, password: string): Promise<EnterpriseSession> {
  sessionText(enterpriseCode); sessionText(loginId, 320);
  if (!password || password.length > 10000) throw new ApiError("Enter your Employee credentials.");
  const generation = ++sessionGeneration;
  const auth = await request("/nodics/profile/v0/employee/browser/authenticate", null, { loginId, password }, "POST", { enterpriseCode });
  const session = await confirmEnterpriseSession(auth, enterpriseCode);
  if (generation !== sessionGeneration) throw new ApiError("This sign-in is no longer current.");
  return session;
}
export type EnterpriseMembership = { code: string; revision: number; enterpriseCode: string; enterpriseName: string };
/** Only Profile-projected, accepted SWITCH choices are rendered; no local role or invitation authority. */
export async function enterpriseMemberships(session: EnterpriseSession, signal?: AbortSignal): Promise<EnterpriseMembership[]> {
  const workspace = sessionRecord(await request("/nodics/profile/v0/enterprise-memberships/workspace", session, undefined, "GET", { signal }));
  if (workspace.contractVersion !== 1 || workspace.owner !== "profile" || workspace.renderer !== "axis.enterprise-memberships" ||
      workspace.enterpriseCode !== session.enterpriseCode || !Array.isArray(workspace.items) || workspace.items.length > 100)
    throw new ApiError("Enterprise memberships could not be confirmed.");
  const items = workspace.items.map(value => {
    const row = sessionRecord(value);
    if (!Array.isArray(row.actions) || row.actions.length > 1 || row.actions.some(action => !["ACCEPT", "SWITCH"].includes(action)) ||
        typeof row.accepted !== "boolean" || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1 ||
        !["PENDING", "ACTIVE", "REGISTERED", "SUSPENDED", "REVOKED"].includes(String(row.status)) ||
        row.accepted && row.status !== "REGISTERED" || row.actions.includes("SWITCH") && (!row.accepted || row.enterpriseCode === session.enterpriseCode))
      throw new ApiError("Enterprise membership evidence could not be confirmed.");
    return { code: sessionText(row.code, 128), revision: Number(row.revision), enterpriseCode: sessionText(row.enterpriseCode, 128),
      enterpriseName: sessionText(row.enterpriseName, 256), switchable: row.actions.includes("SWITCH") };
  });
  if (new Set(items.map(row => row.code)).size !== items.length) throw new ApiError("Enterprise memberships are ambiguous.");
  return items.filter(row => row.switchable).map(({ switchable: _, ...row }) => row);
}
/** Clears old local admission before one reviewed switch; uncertain issuance never retains the old signed context. */
export async function switchEnterpriseSession(current: EnterpriseSession, selected: EnterpriseMembership): Promise<EnterpriseSession> {
  saveSession(null);
  const generation = sessionGeneration;
  const choices = await enterpriseMemberships(current);
  if (!choices.some(row => row.code === selected.code && row.revision === selected.revision && row.enterpriseCode === selected.enterpriseCode))
    throw new ApiError("The accepted membership changed. Sign in again.");
  if (generation !== sessionGeneration) throw new ApiError("This context switch is no longer current.");
  const result = sessionRecord(await request("/nodics/profile/v0/employee/browser/switch-enterprise", current,
    { assignmentCode: selected.code, revision: selected.revision }));
  if (result.enterpriseCode !== selected.enterpriseCode) throw new ApiError("Enterprise switching could not be confirmed. Sign in again.");
  const next = await confirmEnterpriseSession(result, selected.enterpriseCode);
  if (next.loginId !== current.loginId || generation !== sessionGeneration) throw new ApiError("Enterprise switching could not be confirmed. Sign in again.");
  return next;
}
export function commandKey(): string {
  return crypto.randomUUID();
}
export function nameOf(value?: { en?: string } | string): string {
  return typeof value === "string" ? value : value?.en || "";
}
export function photoOf(asset: {
  metadata?: { photo?: { url?: string } };
}): string {
  return asset.metadata?.photo?.url || "/media/asset-laptop.svg";
}
export function statusLabel(status: string): string {
  return (
    {
      SUBMITTED: "Awaiting approval",
      APPROVED: "Approved",
      REJECTED: "Rejected",
      DRAFT: "Draft",
      MEDIA_STAGED: "Draft",
      METADATA_SUGGESTED: "Draft",
      AWAITING_SUBMITTER_CONFIRMATION: "Ready to review",
      OWNED: "Owned",
      LISTED: "Available to trade",
    }[status] || status.replaceAll("_", " ").toLowerCase()
  );
}

export function originalRewardOf(asset: Asset): string | number {
  const settlement = asset.metadata.rewardSettlement;
  const confirmed = asset.metadata.confirmedReward;
  const valuation = asset.metadata.valuation;
  return (
    settlement?.rewardAmount ??
    confirmed?.rewardAmount ??
    valuation?.rewards.find(
      (reward) => reward.rewardTypeCode === valuation.pointsRewardTypeCode,
    )?.amount ??
    asset.metadata.openingReward ??
    "Unavailable"
  );
}

export type SavedImpactAssessment = {
  code: string;
  accepted: boolean;
  calculatedAt: string;
  calculationStatus: string;
  assessment: EnvironmentalAssessment | null;
  reason?: string | null;
};
export type ImpactAssessmentHistory = {
  acceptedAssessmentCode: string | null;
  total: number;
  page: number;
  limit: number;
  items: SavedImpactAssessment[];
  selectionHistory?: {
    total: number;
    items: {
      code: string;
      assessmentCode: string;
      at: string;
      reason: string;
    }[];
  };
};
