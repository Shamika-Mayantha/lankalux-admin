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

## Brand

Visual identity is copied from the public LankaLux website (`lankalux-design.css`), not invented for admin:

| Token | Value | Use |
| --- | --- | --- |
| `--ivory` / `brand.background` | `#F9F4EB` | Page background |
| `--ivory-deep` / `brand.cream` | `#F1E9DA` | Cards, sidebar, surfaces |
| `--forest` | `#1A2A1D` | Headings, primary buttons, nav ink |
| `--forest-soft` | `#243328` | Button hover |
| `--gold` | `#B18544` | Active nav, selected itinerary, small highlights |
| `--charcoal` / `brand.text` | `#252523` | Body text |
| `--muted` / `brand.textMuted` | `#6b6b66` | Secondary text (website form hints) |
| `--line` / `brand.border` | `rgba(26, 42, 29, 0.12)` | Borders |
| Display font | Be Vietnam Pro | Headings |
| Body font | Open Sans | UI copy |
| Logo | `/brand/lankalux-logo.png` | Horizontal lockup (mark + wordmark + tagline) |

Gold is never used as a large fill. Primary buttons are forest on ivory, matching lankalux.com.

