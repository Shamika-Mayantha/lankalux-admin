# LankaLux Admin Console — Repository Audit

Date: 2026-08-14  
Repository: `github.com/Shamika-Mayantha/lankalux-admin`  
Production domain: `https://admin.lankalux.com`  
Safety rule: the existing production application under `app/`, `components/`, and `lib/` is left in place. The replacement lives at `/console` (admin) and `/journey` (client preview).

This document is the technical audit. It does not contain secrets.

---

## 1. Current technology stack

| Layer | Current |
| --- | --- |
| Framework | Next.js **16.1.6** App Router |
| UI | React **19.2.3**, Tailwind CSS **4**, Geist fonts, lucide-react |
| Language | TypeScript **5.9.3** (`strict: true`, but widespread `any`) |
| Hosting | Vercel (`admin.lankalux.com`) |
| Database / Auth / Storage | Supabase (`@supabase/supabase-js` ^2.39) |
| AI | OpenAI SDK ^6.22, model `gpt-4o-mini` |
| Email | Nodemailer ^8 via SMTP (Zoho-compatible) |
| Chat (website) | OpenAI + `website_chat_sessions` |
| Package manager | npm (`package-lock.json`) |

No middleware, no `@supabase/ssr`, no Zod, no test runner, no server-side session guard. Admin pages are `'use client'` and check `supabase.auth.getSession()` in the browser.

Vercel Hobby timeout is hard-coded on the bulk generator:

```ts
export const maxDuration = 10
```

That single line is a primary cause of itinerary option 3 failing.

---

## 2. Current folder structure

```
app/
  api/                    # privileged + public APIs
  dashboard/              # CRM home, chats, vehicle calendar
  itinerary/              # public client itinerary pages
  login/
  requests/               # new + [id] (the 3,200-line god page)
  layout.tsx / page.tsx / globals.css
components/               # mixed UI, itinerary render, hotels, theme
hooks/useInactivityLogout.ts   # 45-minute idle logout
lib/                      # supabase, fleet, email, hotels, images, chat
public/images/            # real LankaLux photographs (keep)
public/Fleet/             # real vehicle photographs (keep)
supabase/migrations/      # schema changes for "Client Requests" and related tables
```

There is no `features/`, `services/`, `types/`, or `config/` layer. Business logic is embedded in route handlers and the request detail page.

---

## 3. Supabase architecture

The live table used by **all** application code is:

**`"Client Requests"`** (quoted, space in the name)

Loose SQL files also mention a table named `requests`. That table is **not** queried by the running app. Treat `"Client Requests"` as production. Do not drop it.

Project id referenced in comments: `evmsntnprujqfejkmipq`.

Access pattern:

- Browser: anon key + authenticated RLS (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- API routes: service role (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS
- Uploads: Storage bucket `client-uploads` (override `SUPABASE_UPLOADS_BUCKET`)
- Hotel images: intended bucket `hotel-images` (comment only)

There is no dedicated hotels, itineraries, communications, or activity-log table in production. Almost everything is JSON text/JSONB columns on `"Client Requests"`.

---

## 4. Current database tables

### `"Client Requests"` (production CRM)

Observed columns from TypeScript usage:

| Column | Role |
| --- | --- |
| `id` | TEXT sequential `req-id-001` (legacy UUIDs may still exist) |
| `client_name`, `email`, `whatsapp`, `origin_country` | Contact |
| `start_date`, `end_date`, `duration` | Travel window (duration is inclusive days) |
| `number_of_adults`, `number_of_children`, `children_ages` | Party (`children_ages` is JSON text) |
| `additional_preferences` | Free-text interests / notes from web form |
| `itineraryoptions` | JSON **string**: `{ options: [opt0, opt1, opt2] }` — all three variants |
| `selected_option` | Integer index 0–2 |
| `public_token` | Public URL token for `/itinerary/[token]/[option]` |
| `status` | `new` \| `follow_up` \| `deposit` \| `sold` \| `after_sales` \| `cancelled` |
| `cancellation_reason` | Text |
| `notes` | Internal notes |
| `hotel_options` | JSON text: `{ hotels[], selectedHotelId }` per request |
| `sent_at`, `last_sent_at`, `last_sent_option`, `email_sent_count` | Email counters |
| `sent_options` | JSON array of send snapshots (trimmed to 10) |
| `follow_up_emails_sent` | JSON text of template-email log |
| `link_opens` | JSON text of public-page opens |
| `created_at`, `updated_at` | Timestamps |

Missing vs product spec (must add, not invent on the client): assigned employee, lead source, budget, hotel preference, vehicle preference, special requirements, interests (structured), arrival/departure flight, requested destinations.

### `itinerary_shares`

Stable per-send snapshot. **Schema bug:** `request_id uuid not null` while request ids are `req-id-001` (TEXT). Inserts fail; email falls back to `/itinerary/{public_token}/{index}` which can later show a *regenerated* itinerary. This is a direct source-of-truth failure.

### `website_chat_sessions`

Live-chat intake from lankalux.com. Keep.

### `"Vehicle Reservations"`

Calendar occupancy, currently only `Toyota Voxy`. Keep.

### `requests`

SQL-only / unused by code. Do not migrate production onto it.

---

## 5. Current authentication implementation

- Supabase Email/Password (`signInWithPassword`)
- Session in `localStorage` via supabase-js
- Client-only guards on `/dashboard`, `/requests/*`
- Root `/` redirects to dashboard or login
- Idle logout: **45 minutes** (`hooks/useInactivityLogout.ts`)
- No route middleware
- No role/profile table (`profiles` does not exist)
- Public itinerary routes are unauthenticated by design (token)

Reuse this auth. Do not introduce a second identity provider.

---

## 6. Current itinerary generation workflow

1. Admin opens `/requests/[id]` and clicks generate.
2. **Bulk path** `POST /api/generate-itinerary` tries to generate options 1, 2, 3 **sequentially in one Vercel invocation** (`maxDuration = 10`).
3. Each option is an OpenAI `gpt-4o-mini` JSON completion with a very large prompt (photo mapping dumped into the prompt).
4. After each option, JSON is written into `"Client Requests".itineraryoptions`.
5. **Single path** `POST /api/generate-single-option` regenerates one index (0/1/2), with uniqueness retries (threshold **0.32**) and day-count retries (up to 8).
6. Selecting an option sets `selected_option` and creates/uses `public_token`.
7. Preview, email, and WhatsApp do **not** share one reader. They each reconstruct URLs and payloads independently.

There are no generation logs, no prompt version field, no itinerary row per option, and no draft/published split. Edits mutate the same JSON blob.

---

## 7. Why itinerary #3 currently fails

Multiple independent failure modes stack on option 3:

1. **Timeout.** One request generates three full itineraries. `maxDuration = 10`. A 10-day trip with ~800 tokens/day easily exceeds 10s before option 3 is saved. The UI then surfaces a 504 / non-JSON body.
2. **Token truncation.** `max_tokens` is capped (6000 bulk / 3000–5000 single). JSON is sometimes incomplete; the code *pads closing braces*, which produces invalid or truncated day arrays.
3. **Hard uniqueness reject.** Option 3 is compared to options 1 and 2 (and previous generations). Classic Sri Lanka routing (Cultural Triangle → Hill Country → South) looks “too similar”. Single-option returns **409** and tells the user to click again. Bulk throws and can abort the loop.
4. **Day-count mismatch.** Prompt asks the model to count inclusive days. Off-by-one then fails validation. Single-option will clone the last day to pad — bulk throws instead.
5. **No isolated job state.** Options live in one JSON array. A failed bulk run can leave a partial array; a later bulk run can overwrite successful options. Regeneration of one option **clears `selected_option`**.
6. **Prompt size.** Photo-mapping JSON is inlined into every prompt, increasing latency and truncation risk. Image selection should be a server-side mapper, not an LLM task.

The new architecture must run `generation_1`, `generation_2`, `generation_3` as **separate jobs**, persist each immediately, and never delete a successful sibling when one fails.

---

## 8. Current email workflow

`POST /api/send-itinerary`

- Nodemailer SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` or `SMTP_PASSWORD`, `SMTP_FROM`
- Requires `selected_option` + `public_token` when including itinerary
- Builds HTML in the route (not from a shared renderer)
- Attempts insert into `itinerary_shares` (often fails; see UUID bug)
- On share failure, email button uses `/itinerary/{token}/{index}` which reads **live** `itineraryoptions`, not the sent snapshot
- Logs `SMTP_HOST` / `SMTP_USER` to server logs (noisy; must not log secrets — `SMTP_PASS` is masked, good)
- Marks sent only after `sendMail` succeeds (correct)
- Then writes `sent_options`, bumps `email_sent_count`, forces status `follow_up`
- Follow-up templates: `POST /api/send-template-email` (no itinerary link by design)

The email currently does **not** embed the itinerary body; it sends a CTA link. That is acceptable if the link resolves the **published snapshot**. Today it often does not.

---

## 9. Current WhatsApp workflow

There is **no WhatsApp Business API**. Sharing is `https://wa.me/{digits}?text=...`.

Admin share (`app/requests/[id]/page.tsx`):

- Base URL is **`https://lankalux.com`** (marketing site, not the admin app)
- Path is `/itinerary/{public_token}/{selected_option}`
- Message is link-only; it does not use `itinerary_shares` snapshots
- No preview modal of the final message in the old send path (preview modal exists but still calls this handler)
- No activity log row

Client-facing itinerary pages hardcode business number `94763261788` for “contact us”.

**Mismatch:** Email aims at `https://admin.lankalux.com/itinerary/share/{token}` (snapshot). WhatsApp aims at `https://lankalux.com/itinerary/{public_token}/{index}` (live, possibly regenerated, possibly 404 on the marketing domain). This is the bug the rebuild must make impossible.

---

## 10. Existing external APIs

| Integration | Where | Notes |
| --- | --- | --- |
| OpenAI Chat Completions | generate-itinerary, generate-single-option, chat | `OPENAI_API_KEY`, optional `OPENAI_CHAT_MODEL` |
| Supabase REST / Auth / Storage | everywhere | service role on server |
| SMTP (Zoho-style) | send-itinerary, send-template-email | App password expected |
| Booking.com HTML scrape | extract-booking-hotel | Server-side fetch of hotel JSON-LD |
| WhatsApp click-to-chat | wa.me | No API key |
| Public website → admin | `POST /api/requests`, `/api/chat`, `/api/chats` | CORS `*`; **must stay** for lankalux.com intake |

Do not break `/api/requests` or chat endpoints. The public site depends on them.

---

## 11. Existing environment variables (names only)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_UPLOADS_BUCKET          # optional, default client-uploads
OPENAI_API_KEY
OPENAI_CHAT_MODEL                # optional, default gpt-4o-mini
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASS
SMTP_PASSWORD                    # compatibility alias for SMTP_PASS
SMTP_FROM
NODE_ENV
```

No `.env` is committed (`.gitignore` has `.env*`). Compatibility layer: keep reading `SMTP_PASS || SMTP_PASSWORD`.

---

## 12. Existing image / assets system

Real photographs are in git under `public/images/` and `public/Fleet/`. **Keep them. Do not replace with AI stock.**

Logo: `public/favicon.png` and `app/favicon.png`. Reuse; do not regenerate.

`public/images/photo-mapping.json` maps destinations → paths. Several mapped files **do not exist** (`atamasthana.jpg`, `gregorylake.jpg`, `arugambay.jpg`, `placeholder.jpg`, …). Several files **exist but are unmapped** (`mirissa.jpg`, `nuwaraeliya.jpg`, `Ella Rock.jpg`, `Train 1.jpg`, `waterfall.jpg`, `temple.jpg`, `beach.jpg`, `bear.jpg`).

`lib/managed-image.ts` normalizes uploaded vs default images. Uploads go to Supabase Storage.

Vehicle images: `lib/fleet.ts` points at `/Fleet/*.jpg` (served from `public/Fleet/`).

There is no central mapper used by email, WhatsApp, and preview together. The new console adds `services/image-map.service.ts` as that utility.

---

## 13. Components / business logic that can safely be reused

Reuse as **data or infrastructure**, not as UI copies:

- Supabase project, auth users, `"Client Requests"` rows
- `public/images/*`, `public/Fleet/*`, logo
- Fleet vehicle catalogue (ids: sedan, voxy, partybus, flatroof, highroof, safarijeep)
- SMTP + OpenAI env vars
- Idle-logout duration (45 minutes)
- Follow-up email *intent* (templates), rewritten against the shared renderer
- Public intake `POST /api/requests` and chat APIs (leave in place)
- `website_chat_sessions` and `"Vehicle Reservations"`
- Booking.com extractor idea (optional later)
- Gold/charcoal brand tokens already in `globals.css`

---

## 14. Components / business logic that should be discarded

Do not port these into the new console:

- `app/requests/[id]/page.tsx` (~3,200 lines) as a god component
- Bulk `/api/generate-itinerary` 10-second three-in-one job
- Uniqueness-409 that aborts option 3
- Brace-padding JSON “repair”
- Dual URL schemes (`lankalux.com` vs `admin.lankalux.com`)
- Reconstructing itineraries at send time
- `itinerary_shares.request_id uuid` as-is
- Client-side itinerary HTML built separately from the public page
- Hardcoded `any` request updates scattered through the page
- Storing source of truth only in React state
- Alert-based error UX

---

## 15. Proposed new architecture

New code is namespaced so production routes keep working:

| Path | Purpose |
| --- | --- |
| `/console` | New admin console |
| `/journey/[token]` | New client preview (share token only) |
| `/api/v2/*` | New privileged APIs |
| Existing `/dashboard`, `/requests`, `/itinerary`, `/api/*` | Unchanged production |

```
types/                  domain types
config/                 brand, env names, statuses, prompt versions
validation/             Zod schemas (AI + API)
services/               supabase, itinerary, ai, email, whatsapp, share, activity, image-map
features/               UI by module (dashboard, requests, editor, journey renderer)
app/console/            admin routes
app/journey/            public renderer
app/api/v2/             server APIs
supabase/migrations/    additive SQL only
```

**Single source of truth**

```
AI job (1|2|3)
  → validate JSON
  → persist itineraries row (and compatibility JSON)
  → admin preview/editor reads that row
  → Select publishes a snapshot
  → getPublishedItinerary(requestId) / getClientItinerary(token)
       ↳ Journey page
       ↳ Email HTML
       ↳ WhatsApp text
       ↳ future PDF
```

No path may call OpenAI while sending email or WhatsApp.

Request ids stay **`req-id-001`** (existing public website and production data). The spec’s `requestid-001` is **not** used; changing format would break lankalux.com intake and historical rows.

Statuses (console): `new`, `follow_up`, `sold`, `after_sales`, `cancelled`. Legacy `deposit` remains readable and maps into Sold/Follow Up filters so old rows do not vanish.

---

## 16. Database migration requirements

Additive only. No drops. No rename of `"Client Requests"`.

1. Extra columns on `"Client Requests"` for product fields + `selected_itinerary_id`.
2. New tables: `itineraries`, `itinerary_generations`, `share_links` (TEXT `request_id`), `activity_logs`, `communications`, `hotels`, `request_hotels`, `vehicles`.
3. RLS: authenticated full access; public `SELECT` on `share_links` by token via service role only (do not open wide anon read of PII).
4. Seed `vehicles` from the existing fleet catalogue.
5. Dual-write `itineraryoptions` during transition so the old UI still sees generated options.
6. Do **not** alter `itinerary_shares` in place (production may have rows). New table `share_links` replaces it for the console.

---

## 17. Recommended rebuilding sequence

1. Audit (this document) — done.
2. Scaffold `/console` + `/journey` + `/api/v2` without touching production pages.
3. Persistence + Zod itinerary schema + image mapper.
4. Requests module + dashboard.
5. Isolated generation jobs + logs + three-card selection.
6. Visual editor (draft vs published).
7. Canonical reader + client journey page.
8. Email + WhatsApp from that reader + communication/activity log.
9. Hotels, vehicles, settings.
10. Manual test of the 20-point flow on a `Test Client` request.
11. Preview deploy. Production domain switch only after acceptance.
12. Only then remove the old frontend.

Rollback: keep serving the existing `app/dashboard` and `app/requests` until cutover. Vercel rollback remains the previous deployment.
