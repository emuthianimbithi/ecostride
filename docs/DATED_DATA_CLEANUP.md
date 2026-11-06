# Remove old payments and registrations

Requested cutoff: **2026-11-06 00:00:00 Africa/Nairobi**, equivalent to **2026-11-05 21:00:00 UTC**. All older payments and registrations are selected, including real historical records, not just seed/demo records. Records created at or after that instant are retained. This is a one-time dated operation, not a rolling daily task.

The script previews by default. Apply removes selected records, their payment events/receipts/jobs and registration consents/bibs/check-ins. It preserves orders, products, events, accounts, published result contents, imported bank rows, media and previous audit history. Result and reconciliation references to removed records are detached; affected reconciliation rows become unmatched. Old orders can retain their historical status, but collection still requires a saved matching successful payment. Receipt files remain in storage; file removal is outside this operation.

If a registration selected for deletion has a payment created on/after the cutoff, apply aborts and rolls back. Review that linkage instead of deleting today's payment. An audit entry records the cutoff and deletion counts on success. Keep a fresh database backup because the deletions are permanent.

On the VM, from `/opt/ecostride`, after pulling the commit containing the script:

```sh
# Preview: no data changes and no backend stop needed.
docker compose exec -T db sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v apply=false' < scripts/cleanup-before-date.sql
```

After reviewing the counts, back up and stop the backend before applying. Check each command's result; do not apply if the backup fails.

```sh
backup="/root/ecostride-before-cleanup-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup" && ls -lh "$backup"
docker compose stop backend
docker compose exec -T db sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v apply=true' < scripts/cleanup-before-date.sql
# Restart even if cleanup reports an error; errors roll back the transaction.
docker compose start backend
```

No demo seeding is needed. The SQL does not change PesaPal configuration or create/refund payments. Rebuilding the backend/frontend is separately required for the PesaPal-only checkout change.

Verification: tested preview, apply, repeated apply, exact-cutoff retention, linked-record removal, historical result/reconciliation preservation, and rollback for an older registration with a newer payment against disposable PostgreSQL. Real VM contents have not been inspected or deleted by these tests.
