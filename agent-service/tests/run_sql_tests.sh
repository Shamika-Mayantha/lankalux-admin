#!/usr/bin/env bash
# Applies the AI migration to a throwaway local Postgres database and runs the
# permission tests. Usage: PGHOST=... PGPORT=... PGUSER=postgres tests/run_sql_tests.sh
# pgvector is not needed locally: the vector column is swapped for real[] in the copy.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mig="$here/../../supabase/migrations/20261016000000_ai_agent_system.sql"
mig2="$here/../../supabase/migrations/20261016100000_ai_whatsapp_replies.sql"
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
