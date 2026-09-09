/** Customer transport; all balances, ownership and draft revisions are server-authoritative. */
export type Facts = {
  name?: string;
  description?: string;
  categoryCode?: string;
  itemTypeCode?: string;
  conditionGrade?: string;
  quantity?: number;
  preferredCollectionPointCode?: string;
  sizeClass?: "SMALL" | "MEDIUM" | "HEAVY" | "UNKNOWN";
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
  status: "NOT_ASSESSED" | "ILLUSTRATIVE" | "ESTIMATED" | "CONFIRMED" | "RECALCULATED" | "FAILED";
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
  inputs?: { weightKg?: number; weightSource?: string; quantity?: number; defaultUnitWeightKg?: number };
  factors?: { factorKgCO2ePerKg?: number; factorSource?: string; factorSetVersion?: string };
  methodology: {
    formulaVersion: string | null;
    profileCode: string;
    providerCode: string | null;
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
  carbonCredits: { status: "NOT_ASSESSED"; issuedQuantity: null; registryReference: null; reason: string };
};
export type Submission = {
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
        accuracy: number;
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
        taxonomyMatch?: { kind: "EXACT" | "GENERIC_FALLBACK"; itemTypeCode: string; categoryCode: string };
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
  code: string;
  revision: number;
  assetStatus: string;
  ownerRef: Ref;
  sourceSubmissionCode: string;
  metadata: {
    facts: Facts;
    photo?: { code?: string; url?: string };
    openingReward?: number;
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
  events: { code: string; eventType?: string }[];
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
  code: string;
  name: string;
  issuer?: string;
  imageUrl?: string;
  rewardPrice: number;
  biddingAvailable?: boolean;
  carbonUnits?: number;
  ownerCode?: string;
  kind: "ASSET" | "COUPON";
  description?: string;
  expiresAt?: string;
  assetCode?: string;
  revision: number | string;
};
export type Market = { assets: Offer[]; coupons: Offer[] };
export type Session = { token: string; loginId: string };
export const API = "/nodics/eWaste/v0";
export const APP_API = "/nodics/circa.ewaste/v0";
export function unwrap<T>(value: unknown): T {
  let item = value as Record<string, unknown>;
  for (let i = 0; i < 6 && item && !Array.isArray(item); i++) {
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
export async function request<T>(
  path: string,
  session?: Session | null,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
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
      headers: {
        "Content-Type": "application/json",
        "x-enterprise-code": "default",
        ...(path.startsWith("/nodics/profile/v0/customer/browser/") &&
        customerCsrf()
          ? { "x-csrf-token": customerCsrf() }
          : {}),
        ...(telegramLaunch
          ? { "x-circa-telegram-launch": telegramLaunch }
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
    .find((v) => v.startsWith("nodics_customer_csrf="));
  return value ? decodeURIComponent(value.slice(value.indexOf("=") + 1)) : "";
}
/** Access credentials live only in memory; discard the legacy browser-storage copy. */
export function readSession(): Session | null {
  sessionStorage.removeItem("circa.session");
  return memorySession;
}
export function saveSession(session: Session | null) {
  sessionStorage.removeItem("circa.session");
  sessionGeneration++;
  memorySession = session;
}
/** Deduplicates cookie rotation and discards restoration that finishes after logout or a newer login. */
export function restoreSession(): Promise<Session | null> {
  if (restoringSession) return restoringSession;
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
  saveSession(null);
  if (customerCsrf())
    await request("/nodics/profile/v0/customer/browser/logout", null, {});
}
export function commandKey(): string {
  return crypto.randomUUID();
}
export function nameOf(value?: { en?: string } | string): string {
  return typeof value === "string" ? value : value?.en || "";
}
export function photoOf(asset: Asset | Submission): string {
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
  const valuation = asset.metadata.valuation;
  return (
    valuation?.rewards.find(
      (reward) => reward.rewardTypeCode === valuation.pointsRewardTypeCode,
    )?.amount ??
    asset.metadata.openingReward ??
    "Unavailable"
  );
}
