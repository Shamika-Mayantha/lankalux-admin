# LankaLux agent service

The AI General Manager and six specialist agents. Runs on the Oracle Cloud VM next to a
local Ollama model and uses the existing Supabase CRM as its only database.

Plan and progress: `/mnt/project-files/ai-system/PLAN.md` and `PROGRESS.md` in the project.

## How it fits together

```
CRM write (admin, website form, email webhook)
   └─ AFTER trigger ─> ai_events            (Postgres, never blocks the CRM write)
worker (this service, Oracle VM)
   ├─ pump: ai_events ─> manager.route_event task
   ├─ claim: ai_claim_tasks()  (SKIP LOCKED, leases → crash recovery)
   ├─ agent handler ─> local model (Ollama, JSON schema output only)
   └─ propose ai_actions ─> ai_begin_action() gate in SQL
         level 1: runs   level 2: needs AI Manager decision   level 3: needs owner in the console
```

* Logs in as the `lankalux_agent` Postgres role, not the service-role key. The role can
  read the CRM and the AI tables, run the queue and propose actions. It cannot write CRM
  tables directly, change settings, prompts, policies or permissions, or record an owner
  approval. See `../supabase/migrations/20261016000000_ai_agent_system.sql`.
* No inbound ports. The VM only connects out (Postgres over TLS, and later HTTPS to admin
  and Meta via Supabase Edge Functions).
* The Lead Scout (`agents/scout.py`) reads public posts only: Reddit through its official API
  (needs `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`) and RSS feeds the owner lists in
  `ai_agents.config` for `scout`, where robots.txt allows. It never posts or emails; the owner
  replies from the LankaLux account. Leads are in `ai_leads`.
* The Win-back agent (`agents/winback.py`) drafts, on Mondays, up to 10 emails a week to past
  enquiries that never booked (Level 3: the owner approves each). The dispatcher adds an
  unsubscribe link; `ai_email_optouts` is enforced by `ai_begin_action()` for every AI email.
* Everything starts switched off: `ai_settings.system_paused = true` and
  `customer_messaging_enabled = false`.

## Tests

```
# SQL permission tests (13 checks) on a scratch local Postgres
PGHOST=... PGPORT=... PGUSER=postgres tests/run_sql_tests.sh
# Python tests; integration ones need a scratch server
PG_TEST_ADMIN_DSN="host=... port=... user=postgres" pytest -q
```

## VM

`deploy/setup-vm.sh` installs Ollama (localhost only), the venv and the systemd units.
`lankalux-bench` compares models on LankaLux-shaped jobs before one is chosen.
