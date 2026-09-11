import type { ItemDescriptor } from "../../api";

export type WasteResource = "submissions" | "assets";
export type WasteView = WasteResource | "drafts";
export type WasteSelection = { resource: WasteResource; code: string };
export type WasteAction = {
  code: "CONTINUE" | "LIST" | "GIFT" | "OPEN_LISTING";
  label: string;
  targetCode?: string;
  command?: { idempotencyKey: string; rewardPrice: number };
};
/** Versioned read model, supplied by the authenticated Waste owner. */
export type WasteItem = {
  code: string;
  resource: WasteResource;
  revision: number;
  descriptor: ItemDescriptor;
  status: { code: string; label: string; tone: string; group: string };
  photo: { code?: string | null; url?: string | null } | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string | number | null;
  actions: WasteAction[];
  nextStep: { title: string; description: string };
  ownership: {
    isCurrentOwner: boolean;
    originalReward: string | number | null;
    rewardTypeCode: string | null;
    illustrativeCarbonUnits: number | null;
    askingPrice: number | null;
    settlementStatus: string | null;
  } | null;
};
export type WasteListing = {
  contractVersion: 1;
  view: WasteView;
  items: WasteItem[];
  total: number;
  page: number;
  pageSize: number;
  statuses: { code: string; label: string; count: number }[];
  sorts: { code: string; label: string }[];
  filters: {
    categories: {
      code: string;
      name: { en?: string } | string;
      familyCode?: string;
    }[];
    itemTypes: {
      code: string;
      name: { en?: string } | string;
      categoryCode: string;
    }[];
  };
};
export type WasteDetail = {
  impactHistory?: import("../../api").ImpactAssessmentHistory | null;
  contractVersion: 1;
  item: WasteItem;
  relatedAsset: WasteItem | null;
  sourceSubmission: { code: string; name: string | null } | null;
  collectionPoint: { code: string; name: { en?: string } | string } | null;
  history: {
    code: string;
    label: string;
    at: string;
    description?: string | null;
  }[];
};
export type WasteQuery = {
  view: WasteView;
  q: string;
  status: string;
  categoryCode: string;
  itemTypeCode: string;
  dateFrom: string;
  dateTo: string;
  sort: string;
  page: number;
  limit: number;
};
export type WasteCopy = (key: string, fallback: string) => string;
