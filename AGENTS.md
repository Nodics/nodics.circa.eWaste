# nodics.circa.eWaste

Circa is the customer frontend for Nodics EXP. It consumes the single eWaste domain accelerator and a customer backend module for site composition.

## Boundaries

- Keep reusable waste behavior aligned to `nodics.waste` and the waste accelerator contract.
- Keep reward balances and wallet transactions owned by Loyalty/Wallet APIs.
- Keep coupons, coupon entitlement, and POS claim owned by Commerce/Promotion APIs.
- Keep collection-centre location search/map ownership with `nodics.location`.
- This app may compose those capabilities into a customer journey, but must not become the owner of those backend domains.

## Verification

- Run `npm run verify` for local checks.
- Visually verify the customer site in a browser after customer-facing changes.

Frontend startup is independent of backend health. Keep unavailable/retry UI and
frontend tests in this application. Backend API acceptance must never start or
test this frontend. Container deployment is owned by [docker/README.md](docker/README.md).

Environmental benefit cards render only provider-calculated metrics with valid
assessment status. Show saved carbon/energy/weight ranges and method context; keep
missing metrics null in transport, consolidate absent outcomes, and never convert
prospective input mass into completed diversion or carbon into energy/credits.
