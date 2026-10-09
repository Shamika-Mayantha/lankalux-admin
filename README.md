# LankaLux Admin

Admin console for LankaLux (admin.lankalux.com). Next.js app deployed on Vercel, backed by Supabase.

- `/console`: the admin console (requests, itineraries, invoices, payments, hotels, vehicles). See `docs/CONSOLE.md`.
- `/journey/[token]`, `/itinerary/[token]`: client-facing itinerary links.
- `/dashboard`, `/requests/[id]`: the legacy admin UI.
- `/api/v2/*`, `/api/invoices/*`: admin APIs; every route requires the admin login (`requireAdmin`).
- `/api/requests`, `/api/chat`, `/api/chats`: public endpoints used by the lankalux.com website.

## Local setup

```bash
cp .env.example .env.local   # fill in values
npm ci
npm run dev
```

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run test:console
npm run build
```

## Database

Migrations live in `supabase/migrations/` and are applied by hand in the Supabase SQL editor, in filename order.
Only the admin login (`hello@lankalux.com`) may read or write admin tables; keep public sign-ups disabled in Supabase Auth.
