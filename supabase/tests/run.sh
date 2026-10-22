#!/usr/bin/env bash
# Applies every migration to a throwaway Supabase Postgres container, then runs the SQL tests
# in supabase/tests/*.sql. Needs Docker; nothing touches your real database.
# Usage: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.136}"
NAME="cb-db-test-$$"

docker run -d --rm --name "$NAME" \
  -e POSTGRES_PASSWORD=postgres \
  -e JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
  "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

run_psql() {
  docker exec -i -e PGPASSWORD=postgres "$NAME" \
    psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"
}

for i in $(seq 1 120); do
  if run_psql -c 'select 1' >/dev/null 2>&1; then break; fi
  if [ "$i" = 120 ]; then echo "database did not start" >&2; exit 1; fi
  sleep 1
done

for file in supabase/migrations/*.sql; do
  echo "migrate  $file"
  run_psql < "$file"
done

for file in supabase/tests/*.sql; do
  echo "test     $file"
  run_psql < "$file"
done

echo "db tests passed"
