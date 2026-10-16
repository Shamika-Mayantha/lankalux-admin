#!/usr/bin/env bash
# Applies the AI migration to a throwaway local Postgres database and runs the
# permission tests. Usage: PGHOST=... PGPORT=... PGUSER=postgres tests/run_sql_tests.sh
# pgvector is not needed locally: the vector column is swapped for real[] in the copy.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mig="$here/../../supabase/migrations/20261016000000_ai_agent_system.sql"
mig2="$here/../../supabase/migrations/20261016100000_ai_whatsapp_replies.sql"
mig3="$here/../../supabase/migrations/20261016200000_ai_autonomy.sql"
mig4="$here/../../supabase/migrations/20261016210000_ai_dispatch.sql"
mig5="$here/../../supabase/migrations/20261016220000_ai_playbook.sql"
db="ai_test_$$"
psql -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db" >/dev/null
trap 'psql -q -c "DROP DATABASE IF EXISTS $db" >/dev/null; psql -q -c "DROP ROLE IF EXISTS lankalux_agent" >/dev/null 2>&1 || true' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/sql/supabase_stub.sql" >/dev/null 2>&1 || \
  psql -q -v ON_ERROR_STOP=1 -d "$db" -f <(sed -e '/^CREATE ROLE anon/d' "$here/sql/supabase_stub.sql") >/dev/null
sed -e '/CREATE EXTENSION IF NOT EXISTS vector/d' -e 's/extensions.vector(768)/real[]/' \
    -e '/ai_memory_embedding_idx/,+1d' "$mig" \
  | psql -q -v ON_ERROR_STOP=1 -d "$db" -f - 2>&1 | { grep -v NOTICE || true; }
# Applying twice must also work.
sed -e '/CREATE EXTENSION IF NOT EXISTS vector/d' -e 's/extensions.vector(768)/real[]/' \
    -e '/ai_memory_embedding_idx/,+1d' "$mig" \
  | psql -q -v ON_ERROR_STOP=1 -d "$db" -f - 2>&1 | { grep -v NOTICE || true; }
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$mig2" 2>&1 | { grep -v NOTICE || true; }
psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$mig2" 2>&1 | { grep -v NOTICE || true; }
psql -q -v ON_ERROR_STOP=1 -d "$db" -At -f "$here/sql/test_permissions.sql" 2>&1 | { grep -v -E 'NOTICE|WARNING' || true; }

# Autonomy and dispatch, on a fresh database (the permission test drops ai_events at the end).
db2="ai_test2_$$"
psql -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $db2" >/dev/null
trap 'psql -q -c "DROP DATABASE IF EXISTS $db" >/dev/null; psql -q -c "DROP DATABASE IF EXISTS $db2" >/dev/null; psql -q -c "DROP ROLE IF EXISTS lankalux_agent" >/dev/null 2>&1 || true' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$db2" -f <(sed -e '/^CREATE ROLE/d' -e '/^DO .*service_role/d' "$here/sql/supabase_stub.sql") >/dev/null
sed -e '/CREATE EXTENSION IF NOT EXISTS vector/d' -e 's/extensions.vector(768)/real[]/' \
    -e '/ai_memory_embedding_idx/,+1d' "$mig" | psql -q -v ON_ERROR_STOP=1 -d "$db2" -f - 2>&1 | { grep -v NOTICE || true; }
psql -q -v ON_ERROR_STOP=1 -d "$db2" -f "$mig2" 2>&1 | { grep -v NOTICE || true; }
psql -q -v ON_ERROR_STOP=1 -d "$db2" -f "$here/sql/dispatch_stub.sql" 2>&1 | { grep -v NOTICE || true; }
for m in "$mig3" "$mig3" "$mig4" "$mig4" "$mig5" "$mig5"; do  # each twice: both must be re-runnable
  sed -e '/^CREATE EXTENSION IF NOT EXISTS pg_net/d' -e '/^CREATE EXTENSION IF NOT EXISTS pg_cron/d' "$m" \
    | psql -q -v ON_ERROR_STOP=1 -d "$db2" -f - 2>&1 | { grep -v -E 'NOTICE|^ *[0-9]+$|schedule|^-+$|^\(1 row\)$|^$' || true; }
done
psql -q -v ON_ERROR_STOP=1 -d "$db2" -At -f "$here/sql/test_dispatch.sql" 2>&1 | { grep -v -E 'NOTICE|WARNING' || true; }
