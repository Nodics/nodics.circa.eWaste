# Circa eWaste

Circa is the connected customer storefront for Nodics Waste, Location, Profile,
Media, Copilot, Loyalty and Commerce. The local sample runs at
http://localhost:3600 and keeps customer state in the owning backend services.

## Run and verify

Start the Kickoff runtimes described in the [customer journey guide](../../nodics.kickoff/modules/circa.ewaste/docs/pages/customer-journey.md),
then run `npm install` and `npm run dev -- --host 127.0.0.1 --port 3600` here.
Run `npm run verify` for types, interaction checks and the production build.
The live browser checks require the connected local sample services.

## Sample accounts

The local sample password is `CircaDemo!2026` for `customer@circa.local`,
`seller@circa.local`, and `recipient@circa.local`. Profile performs authentication.
Registration creates an independent customer with an empty wallet.

The opening primary dataset has 20 submissions: 10 approved, 5 pending and 5
rejected; 118 reward points and 152 illustrative carbon units. Browser validation
adds real local records and transactions, so the running balances and counts
change. Reloading the website retains those changes.

## Connected journeys

- Shop and Coupons share search, filters, sorting, grid/list controls, exact counts and server pagination with the My Account listing controls. Quick view and direct product detail pages preserve the listing URL state; purchasing still requires explicit review and confirmation. See the [catalogue guide](../../nodics.kickoff/modules/circa.ewaste/docs/pages/catalogue.md). Run `node test/live/catalogue-browsing.mjs` for read-only desktop/mobile acceptance.

- Public homepage, three original banner images, asset/coupon previews and a
  Location-backed collection-centre map with an accessible centre list.
- Shared Web/Telegram submission controls: permission-aware fresh location,
  100-metre backend arrival policy, private photo, automatic configured-provider
  analysis, correction, persisted draft and one final confirmation.
- Telegram host shell at `/telegram`, with backend-validated signed launch and
  shared secure Profile forms. Durable Telegram account linking, source outcome
  delivery and actual-client acceptance remain pending.
- My Account, submission status/reasons, owned assets, purchase history and
  customer-authorized coupon reveal; separate wallet balance and ledger page.
- `/account` is the customer dashboard: wallet cards, submission status and asset
  charts, recent items, saved drafts and account shortcuts. Figures use
  authenticated wallet balances and backend listing totals, including records
  beyond the current page. Chart labels link to the matching item filters.
- Account navigation separates My items (`/account/items`) and Wallet
  (`/account/wallet`, with `/wallet` retained) from Bids (`/account/bids`), Purchases
  & coupons (`/account/purchases`), and Ownership activity (`/account/activity`).
  The web header menu and mobile Account screen open these views independently;
  mobile deep links retain the host launch context and requested section through
  sign-in. Item listings no longer append transaction or ownership histories.
- Unfinished submissions live in the separate Drafts collection with saved-photo
  previews and Continue draft actions. Main Submissions excludes every unfinished
  state through the backend query, so search, counts and pages remain consistent.
- Location and photo preparation are temporary until image analysis succeeds.
  Leaving early or failing analysis creates no new submission or uploaded Media.
  A successful preparation saves an analyzed draft; final submission remains explicit.
- Fixed-price asset purchase, confirmed listing and gifting. Attached
  illustrative carbon moves with the asset; historical approval rewards stay
  with the contributor. Commerce places orders; Loyalty owns value movement.
- Contact intake records an Engagement reference and reports its verification
  requirement. External support delivery requires deployment configuration.

The sample explicitly conveys digital asset ownership, with no physical delivery
or certified carbon claim. Bidding/hold policy, production merchant redemption,
role hierarchy and full WCMS page-composition publishing remain deployment work.

## Ownership

This frontend stores only UI state and authenticated session/draft references.
It does not own submissions, assets, wallets, coupon codes, or settlement ledgers.
Project policies and illustrative factors remain layered backend configuration.

## Shared collection-centre map

The customer map reads Location's public `COLLECTION_CENTRE_MAP` configuration.
Axis administers the same record. Provider/style, viewport, category labels and
pin colors, visible controls and wheel zoom behavior refresh while the page is
open (15 seconds by default) and on window focus. Mapbox and Leaflet adapters
consume the backend descriptors; fallback is allowed only by backend policy.
The list remains usable when map imagery or settings cannot load.

Configure these values in Axis Map Configuration. Future applications consume
the same versioned Location endpoint; do not introduce storefront-owned provider
settings or copy customer access policy into the map. The frontend Location Map
adapter converts named latitude/longitude values at the provider boundary.


Sharing browser location places a distinct red **You** marker in either map
renderer and centers the map there. The marker stays visible through centre
filtering and expansion; sharing again replaces its position. Permission denial
keeps the centre list available. Browser location remains in component state.
Run `node test/live/map-location.mjs` against the running local services to verify
sharing, repeat sharing, filters, expansion, mobile layout and permission denial
with simulated browser coordinates.

Clicking a centre pin or list entry opens Axis's existing `LocationPopupContent`
inside the active map provider's popup. Both applications import
`@nodics/location-map-ui`, with one maintained component and stylesheet in Axis's
`packages/location-map-ui`. Circa installs the generated archive in `vendor/`;
normal installation does not require an Axis checkout. Update the package from
its canonical source rather than creating a Circa-specific popup.
Run `node test/live/map-centre-details.mjs` for pin/list selection, closing,
filtering, mobile layout and directions-coordinate validation.

## Backend ownership

Reusable domain APIs are provided by the single eWaste accelerator at
`/nodics/eWaste/v0`. Circa public composition, registration and contact adapters
are provided by the customer backend at `/nodics/circa.ewaste/v0`. Keep those
boundaries explicit in api.ts; the frontend application name is unchanged.

## Submission acceptance

`npm run test:live` creates a new local customer/submission and exercises automatic
location/photo/analysis/review. It uses emulated Chromium geolocation at the sample
`cc-dxb-01`; set `CIRCA_COLLECTION_CENTRE` for a different configured centre. This
is Web integration evidence, not native Telegram camera/location qualification.
`CIRCA_EVIDENCE_DIR` selects the screenshot/result directory. Bot credentials belong
only in the ignored backend environment; a public HTTPS launch URL is still needed.


`CustomerAuthentication` is the single Web and Telegram sign-in/registration
component. Both use email/password sign-in and name/email/password registration
through Profile. Host shells call the eWaste channel-entry/link contract and resume after
authentication. The accelerator selects seamless linked sign-in or the shared
form. The browser completes one-use handoffs directly with Profile, which retains
its secure cookies; application codes and sign-in policy are not hardcoded in
channel shells. There is no channel email lookup or OTP process.
WhatsApp should reuse this component through its future secure Web handoff; its
channel adapter remains deferred. A successful registration followed by an
interrupted sign-in retries authentication without creating another customer.

### Mobile Centres tab

The shared `/mobile` and `/telegram` Centres tab shows a map above the centre
list. Search, city, country, centre type, operator, service, accepted-item and
straight-line distance filters drive both views together. Filter values come
from the published centre records; unavailable facets are disabled. Accepted-item
filtering excludes centres without published acceptance categories. Opening hours
remain informational because the response has no structured opening schedule.

Near me uses the active Web or Telegram location host and enables nearest-first
sorting and 1–100 km radius choices. Unknown coordinates remain visible in the
list unless a distance filter requires a position. Cards can focus a centre on
the map and open directions through the host. Map failures leave the list usable.

### App launch

The initial HTML and mobile Web/Telegram loading state share a local Circa
splash with a quiet breathing animation and a short entrance transition.
Branding is available before the host/account requests complete, without a
minimum loading delay. Reduced-motion settings disable both animations;
assistive technology retains the loading status. Existing retry screens handle
startup failures.

### Shared website identity

The mini-app header and compact footer use the same `CircaBrand` renderer and
published `circa.shell` content as the website, including both logo variants,
wordmark, byline and footer copy. The header starts white and switches to the
website's dark-green treatment after scrolling 48 pixels. The mobile tab bar
uses the website footer palette. The scrollable footer retains the published
brand message, copyright, Privacy and Terms links; tab navigation remains
available for the mobile journey. CMS branding loads independently of account
and centre functionality.

Photo analysis preserves the uploaded evidence when recognition fails. Customers
can retry the saved photo, replace it, or enter details using the visible mobile
action bar and the website correction form. A configured general item type keeps
recognizable items reviewable when the catalogue lacks their exact subtype; the
review explains that match. Recognition never submits the draft automatically.

The web and mobile item review share an environmental assessment card. Backend
impact results supply emissions, energy, water, recovery and waste indicators,
units, status, required evidence and calculation provenance. Missing metrics show
“Not assessed”; explicit zero and negative net benefit remain visible. Sample
CO2e calculations are labelled illustrative. Carbon credits require separate
verification/registry evidence and are not calculated or issued by the frontend.
Existing saved drafts without the new metadata remain usable and show a pending
assessment. Refreshing analysis or saving corrected details recalculates impact.

Telegram location capture tries browser geolocation when the native reading omits
accuracy or exceeds the backend-provided accuracy policy. It preserves real
coordinates, accuracy, cancellation and one bounded capture deadline; native
permission denial does not trigger a second permission path. The backend remains
the arrival authority. Specific location errors preserve the draft/photo, discard
the rejected cached observation and offer fresh capture. The mobile location
action stays visible in its fixed bottom bar. Devices without precise location
can resume the saved submission in Telegram on a phone.

Customer confirmation, submitted/reviewed outcomes, account detail and marketplace
asset detail now share `ItemDetailsCard`, driven by the backend's authorized item
descriptor. The primary view emphasizes the photo, name, description and available
environmental assessment; full classification, materials/components, approximate
ranges, condition and environmental observations expand on demand. Customers edit
only name and description. Inconclusive analysis can use the configured manual
review path without asking the customer for technical classifications.

Axis reviewers own classification and physical/environmental corrections. Final
customer views use the reviewed facts and exact public feedback while original
submitted facts remain in the backend audit trail. Channel hosts share this
presentation and API contract. This does not activate an unimplemented channel
adapter or the separate repair/reuse lifecycle.

`test/live/customer-journey.mjs` supports independent verifier/approver sessions;
optional marketplace listing requires `CIRCA_LISTING_TEST=true`.
`test/live/reviewed-descriptor.mjs` checks a supplied local journey fixture and
its reviewed desktop/mobile detail. These are connected automated browser checks,
not physical-device or native messaging-client acceptance evidence.

Review links select the exact item through `/mobile?submission=<code>` or the
Telegram launch `start_param`. The mobile shell keeps the target through shared
sign-in and opens the authorized full item page. It does not substitute another
saved draft. Record codes are bounded selectors, never credentials; the backend
still enforces ownership. Reviewed list titles use the owner-projected identity.


## Customer item workspace

My Account and mobile/Telegram Items share `CustomerWasteWorkspace`: owner-scoped
submission and asset collections, server-side search/status/category/type/date
filters, exact counts, stable pagination, and grid/list layouts. Cards expose a
separate Quick view; image/title/detail links open an independently fetched full
page. Web routes are `/account/submissions/:code` and `/account/assets/:code`;
mobile links use `?submission=:code` or `?asset=:code`. Return navigation retains
filters. Draft continuation is an explicit backend-available action.

The `/account/waste` WCMS Online page supplies banner, copy and detail section
order through `circa.wasteWorkspace`. Install the customer project's
`circa.ewaste:customer-workspace` core release into WCMS Staged and publish its
route through nPublish and Process before serving this frontend. An unavailable
published page shows a recoverable error. Domain data and permitted actions come
from `/nodics/eWaste/v0/account/items` and `/account/items/:code`; WCMS contains no
customer records. The canonical Waste descriptor supplies reviewed identity,
physical/material details, environmental assessment and public review feedback.

Trade/gift dialogs retain explicit confirmation, displayed revision and command
idempotency. Their availability is supplied by the backend and revalidated by the
owning command. Quick view is read-only. Missing evidence stays visibly missing;
private photos show a loading state until the authorized media read completes.

Run `npm run verify` and `node test/live/customer-workspace.mjs`. The latter uses
the documented local sample customer, exercises listing/detail/reload/filter and
mobile navigation, and cancels command previews. It does not submit trades or
prove native Telegram WebView acceptance.


The customer listing starts with its banner. Account email and the duplicate
wallet strip are not page sections. A shared Updates bell in the web and mobile
headers opens the Communication inbox on demand. It resolves safe source
selectors through authorized Waste details and displays the item photo/name,
plain-language outcome, optional public feedback and a details link. Raw message
bodies, technical references and URLs are not rendered as customer copy. Missing
or unauthorized source items use a generic update without exposing item details.

Impact assessments preserve provider/dataset provenance and previous results. Axis uses the backend-authorized assessment endpoints with explicit reasons, confirmation and exact asset revisions. Customer asset details show the accepted environmental assessment and paginated read-only history. CO₂e-to-tonnes conversion is carbon equivalent, not credit issuance; existing reward balances remain separate.
