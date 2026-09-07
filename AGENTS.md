# nodics.circa.eWaste

Circa eWaste is the customer-facing e-waste accelerator application for Nodics EXP.

## Boundaries

- Keep reusable waste behavior aligned to `nodics.waste` and the waste accelerator contract.
- Keep reward balances and wallet transactions owned by Loyalty/Wallet APIs.
- Keep coupons, coupon entitlement, and POS claim owned by Commerce/Promotion APIs.
- Keep collection-centre location search/map ownership with `nodics.location`.
- This app may compose those capabilities into a customer journey, but must not become the owner of those backend domains.

## Verification

- Run `npm run verify` for local checks.
- Visually verify the customer site in a browser after customer-facing changes.
