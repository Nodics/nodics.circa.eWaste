import { useEffect, useState } from "react";
import { AuctionPurchase, type AuctionPurchaseProps } from "./AuctionPurchase";
import { BidComposer } from "./BidsPanel";
import type { Offer, Session } from "./api";
type Props = Omit<AuctionPurchaseProps, "purchase" | "session" | "offer"> & { offer: Offer; session: Session | null; onLogin: () => void };
/** Parent mount owns direct-link selectors and the Bids callback, separate from fixed/coupon purchases. */
export function AuctionJourney(props: Props) {
  const { session, offer } = props;
  return session ? <AuctionJourneySession key={JSON.stringify([session.token, session.enterpriseCode, offer.code])} {...props} session={session} />
    : <button className="primary" onClick={props.onLogin}>Sign in to continue</button>;
}
function AuctionJourneySession(props: Props & { session: Session }) {
  const [selected, setSelected] = useState<AuctionPurchaseProps["purchase"] | undefined>(() => {
    const params = new URLSearchParams(window.location.search), roundCode = params.get("auctionRound"), storeCode = params.get("storeCode");
    return roundCode && storeCode ? { roundCode, storeCode } : undefined;
  });
  useEffect(() => {
    if (!selected) return props.host?.bindBack?.(() => props.onBack?.());
  }, [props.host, props.onBack, selected]);
  return selected ? <AuctionPurchase {...props} purchase={selected} />
    : <BidComposer offer={props.offer} session={props.session} onSelectedPurchase={setSelected} />;
}
