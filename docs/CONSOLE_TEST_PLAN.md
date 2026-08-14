# LankaLux Console — acceptance test plan

The new console is at `/console`. Production `/dashboard` and `/requests` are unchanged.

## Before testing

1. Keep using existing Vercel env vars (names in `.env.example`).
2. Run `supabase/migrations/20260814000000_console_v2_foundation.sql` in the Supabase SQL editor. This is additive and does not drop `"Client Requests"`.
3. Sign in with an existing Supabase admin user at `/console/login`.

## Required test request

Create via `/console/requests/new`:

- Client: Test Client
- Adults: 2
- Children: 2 (ages 8, 11)
- Duration: 10 days
- Route: Sigiriya → Kandy → Ella → Yala → Mirissa

Then verify:

1. Request saves with the next `req-id-XXX` (not a new format). Existing rows remain.
2. Generate itinerary 1 (balanced) succeeds independently.
3. Generate itinerary 2 (relaxed) succeeds independently.
4. Generate itinerary 3 (experience) succeeds independently.
5. Force-fail one job (disconnect, or revoke OpenAI briefly): the other two cards remain.
6. All three can be opened in the editor / preview.
7. Select one option. The others remain stored.
8. Edit a day title and save. Refresh. The change is still there.
9. Client preview (`/journey/[token]` after send, or **Client preview** before send) shows the saved edits.
10. WhatsApp preview text uses the selected title, dates and nights — not a new AI draft.
11. Email introduction is editable; the journey link is the share token for that same snapshot.
12. WhatsApp and email show the same journey name and dates.
13. Hotels attached to the request appear when “Include hotels” is checked.
14. Day photographs come from `public/images/` (Sigiriya, Kandy, Ella, Yala, Mirissa), not stock AI art.
15. Selected vehicle photographs come from `public/Fleet/`.
16. Share URL is `/journey/{token}` and does not expose the database request id.
17. Visiting `/console` while signed out redirects to `/console/login`.
18. `/journey/{token}` is reachable without admin auth.
19. A guessed `/console/requests/{id}` without a session cannot load data (API returns 401).
20. `"Client Requests"` row count is unchanged except for the new Test Client row. No production columns were dropped.

## Rollback

Leave Vercel serving the existing app. `/dashboard` remains the production UI until domain cutover.
