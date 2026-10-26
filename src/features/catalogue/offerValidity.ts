import type { Offer } from "../../api";

/** Displays explicit owner expiry; an absent date never implies unlimited validity. */
export function offerValidity(offer: Pick<Offer, "expiry">): string {
  const expiry = offer.expiry;
  if (expiry?.mode === "NONE") return "No expiry";
  if (expiry?.mode === "FIXED" && typeof expiry.at === "string" && Number.isFinite(Date.parse(expiry.at)))
    return `Valid until ${new Date(expiry.at).toLocaleDateString("en-GB")}`;
  return "Validity not provided";
}
