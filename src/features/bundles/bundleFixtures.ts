import type { Session } from "../../api";
import type {
  BundleOwner,
  Intent,
  ListingContext,
  ManifestCommand,
} from "./bundleClient";
export const session: Session = {
  token: "fixture-access",
  loginId: "fixture-customer",
  kind: "CUSTOMER",
};
export const ownerRef: BundleOwner = {
  module: "profile",
  schema: "customer",
  code: "customer-one",
};
export const recipientRef: BundleOwner = { ...ownerRef, code: "recipient-one" };
export const listingContext: ListingContext = {
  listingContextRef: { code: "binding", revision: 3 },
  storeCode: "governed-store",
  categoryCodes: ["selected-category"],
  currency: "POINTS",
  priceBookCode: "governed-price-book",
  reward: {
    programCode: "governed-program",
    rewardTypeCode: "points",
    scale: 2,
  },
};
export const certificate = {
  code: "certificate-one",
  revision: 3,
  available: true,
  valid: true,
  categoryCode: "phone",
  brandCode: "Brand",
  modelCode: "Model",
  assetStatus: "OWNED",
  custodyStatus: "RECEIVED",
};
export const certificatePage = {
  contractVersion: 1,
  ownerRef,
  items: [certificate],
  page: 1,
  limit: 25,
  total: 1,
};
export const lot = {
  lotCode: "lot-one",
  revision: 4,
  state: "REALIZED",
  unitOfMeasure: "tCO2e",
  scale: 3,
  synthetic: true,
  available: "3.125",
  prospective: "0",
  realized: "4.125",
  reserved: "1",
  total: "4.125",
  totalSpendable: false,
  eligibility: "NOT_CHECKED",
  transferable: null,
};
export const carbonPage = {
  ownerRef,
  items: [lot],
  page: 1,
  limit: 25,
  total: 1,
};
export const manifestCode = "bundle:" + "a".repeat(64);
export const operationCode = "bundle-operation:" + "b".repeat(64);
export const digest = "c".repeat(64);
export function manifestReceipt(command: ManifestCommand) {
  return {
    ...command,
    code: manifestCode,
    revision: 0,
    digest,
    status: "ACTIVE",
    components: [...command.components].reverse(),
  };
}
export function publishedReceipt(command: Record<string, unknown>) {
  return {
    listingContextRef: command.listingContextRef,
    confirmed: true,
    operationCode,
    publicationCode: operationCode,
    productCode: "product-one",
    variantCode: "variant-one",
    sku: "sku-one",
    bindingCode: "binding-one",
    versionId: 0,
    status: "PUBLISHED",
    quantity: "1",
    biddingMode: command.saleMode,
    startsAt: command.startsAt,
    endsAt: command.endsAt,
    ...(command.saleMode === "AUCTION"
      ? { auction: { roundCode: "round-one", storeCode: command.storeCode } }
      : {}),
  };
}
export function giftReceipt(command: Record<string, unknown>) {
  return {
    ...command,
    code: operationCode,
    revision: 2,
    purpose: "GIFT",
    status: "PENDING",
    ownerRef,
    evidence: { manifestDigest: digest },
    deadline: "2099-01-01T00:00:00.000Z",
  };
}
export const intent = {
  mode: "GIFT",
  recipientRef,
  recipientName: "Alex",
  operationKey: "operation-key",
  manifest: {
    ownerRef,
    idempotencyKey: "manifest-key",
    components: [
      {
        kind: "CERTIFICATE",
        reference: {
          module: "wasteCore",
          schema: "wasteAsset",
          code: certificate.code,
        },
        quantity: "1",
        expectedRevision: certificate.revision,
      },
    ],
  },
} satisfies Intent;
