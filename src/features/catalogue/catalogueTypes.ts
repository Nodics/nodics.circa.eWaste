import type { Offer } from "../../api";
export type CatalogueOption = { code: string; label: string };
export type CatalogueListing = {
  kind: Offer["kind"];
  items: Offer[];
  page: number;
  pageSize: number;
  total: number;
  facets: {
    categories: CatalogueOption[];
    conditions: CatalogueOption[];
    issuers: CatalogueOption[];
  };
};
