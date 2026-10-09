# LankaLux Admin

Admin console for LankaLux (admin.lankalux.com). Next.js app deployed on Vercel, backed by Supabase.

- `/console`: the admin console (requests, itineraries, invoices, payments, hotels, vehicles). See `docs/CONSOLE.md`.
- `/journey/[token]`, `/itinerary/[token]`: client-facing itinerary links.
- `/dashboard`, `/requests/[id]`: the legacy admin UI.
- `/api/v2/*`, `/api/invoices/*`: admin APIs. `requireAdmin` means a supervisor; routes agents use call
  `requireStaff` / `requireRequestAccess` instead (see `services/staff.service.ts`).
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
Only supervisors may read or write admin tables directly; keep public sign-ups disabled in Supabase Auth.

## Team logins

Staff logins live in `admin_users` (migration `20261009020000_staff_roles.sql`). Supervisors add people from
**Console → Team**, which creates the Supabase Auth user on the server. `hello@lankalux.com` is always a supervisor.

- **Supervisor:** sees every request, assigns requests to agents, manages the team, payments and settings.
- **Agent:** sees only requests they created (`created_by`) or that were assigned to them (`assigned_agent_id`),
  plus the invoices for those requests. Everyone can change their own password in Settings.
