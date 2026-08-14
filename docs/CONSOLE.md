# LankaLux Admin Console (v2)

The replacement console lives beside the production app.

- Admin: `/console`
- Client journey: `/journey/[token]`
- APIs: `/api/v2/*`
- Production UI (`/dashboard`, `/requests`, `/itinerary`) is untouched

## Source of truth

`getPublishedItinerary(requestId)` and `getClientItinerary(shareToken)` in `services/itinerary.service.ts` are the only readers used for preview, email and WhatsApp.

## First deploy

1. Apply `supabase/migrations/20260814000000_console_v2_foundation.sql`.
2. Confirm env vars listed in `.env.example` (values already on Vercel).
3. Open `/console` and run `docs/CONSOLE_TEST_PLAN.md`.

Do not point the production domain at this console until the test plan passes.
