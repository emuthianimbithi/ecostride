\set ON_ERROR_STOP on
\if :{?cutoff}
\else
  \set cutoff '2026-11-06 00:00:00+03'
\endif
\if :{?apply}
\else
  \set apply false
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
\if :apply
  -- Stop the backend first. These locks also prevent concurrent writes while
  -- the candidate set and dependent records are being removed.
  LOCK TABLE registrations, payments, receipts, payment_events, jobs,
    consent_records, bib_assignments, checkins, results, reconciliation_matches
    IN SHARE ROW EXCLUSIVE MODE;
\endif

CREATE TEMP TABLE cleanup_cutoff ON COMMIT DROP AS
  SELECT :'cutoff'::timestamptz AS cutoff;
CREATE TEMP TABLE cleanup_registrations ON COMMIT DROP AS
  SELECT id FROM registrations WHERE created_at < (SELECT cutoff FROM cleanup_cutoff);
CREATE TEMP TABLE cleanup_payments ON COMMIT DROP AS
  SELECT id FROM payments WHERE created_at < (SELECT cutoff FROM cleanup_cutoff);
CREATE TEMP TABLE cleanup_receipts ON COMMIT DROP AS
  SELECT id FROM receipts WHERE payment_id IN (SELECT id FROM cleanup_payments);
CREATE TEMP TABLE cleanup_jobs ON COMMIT DROP AS
  SELECT id FROM jobs WHERE
    payload->>'payment_id' IN (SELECT id::text FROM cleanup_payments)
    OR payload->>'registration_id' IN (SELECT id::text FROM cleanup_registrations)
    OR payload->>'receipt_id' IN (SELECT id::text FROM cleanup_receipts);

SELECT cutoff AS cutoff_instant, cutoff AT TIME ZONE 'Africa/Nairobi' AS cutoff_nairobi
  FROM cleanup_cutoff;
SELECT 'payments_to_delete' AS record_type, count(*) FROM cleanup_payments
UNION ALL SELECT 'registrations_to_delete', count(*) FROM cleanup_registrations
UNION ALL SELECT 'linked_receipts_to_delete', count(*) FROM cleanup_receipts
UNION ALL SELECT 'linked_jobs_to_delete', count(*) FROM cleanup_jobs
UNION ALL SELECT 'linked_payment_events_to_delete', count(*) FROM payment_events WHERE payment_id IN (SELECT id FROM cleanup_payments)
UNION ALL SELECT 'linked_consents_to_delete', count(*) FROM consent_records WHERE registration_id IN (SELECT id FROM cleanup_registrations)
UNION ALL SELECT 'linked_bibs_to_delete', count(*) FROM bib_assignments WHERE registration_id IN (SELECT id FROM cleanup_registrations)
UNION ALL SELECT 'linked_checkins_to_delete', count(*) FROM checkins WHERE registration_id IN (SELECT id FROM cleanup_registrations)
UNION ALL SELECT 'results_to_unlink', count(*) FROM results WHERE registration_id IN (SELECT id FROM cleanup_registrations)
UNION ALL SELECT 'reconciliation_rows_to_unlink', count(*) FROM reconciliation_matches WHERE payment_id IN (SELECT id FROM cleanup_payments)
UNION ALL SELECT 'payments_to_keep', count(*) FROM payments WHERE id NOT IN (SELECT id FROM cleanup_payments)
UNION ALL SELECT 'registrations_to_keep', count(*) FROM registrations WHERE id NOT IN (SELECT id FROM cleanup_registrations)
UNION ALL SELECT 'blocking_newer_payments_on_old_registrations', count(*) FROM payments
  WHERE registration_id IN (SELECT id FROM cleanup_registrations)
  AND id NOT IN (SELECT id FROM cleanup_payments);

\if :apply
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM cleanup_cutoff WHERE cutoff > CURRENT_TIMESTAMP) THEN
      RAISE EXCEPTION 'Cutoff cannot be in the future';
    END IF;
    IF EXISTS (SELECT 1 FROM payments WHERE registration_id IN (SELECT id FROM cleanup_registrations)
      AND id NOT IN (SELECT id FROM cleanup_payments)) THEN
      RAISE EXCEPTION 'Cleanup blocked: older registrations have newer payments. No changes committed; review these links first.';
    END IF;
  END $$;

  -- Preserve published results and imported bank rows while removing links
  -- to records being deleted. Keep their historical content for review.
  UPDATE results SET registration_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE registration_id IN (SELECT id FROM cleanup_registrations);
  UPDATE reconciliation_matches SET payment_id = NULL, status = 'unmatched',
    notes = concat_ws(E'\n', NULLIF(notes, ''), 'Payment removed by dated maintenance cleanup; review this row.'),
    updated_at = CURRENT_TIMESTAMP
    WHERE payment_id IN (SELECT id FROM cleanup_payments);

  DELETE FROM jobs WHERE id IN (SELECT id FROM cleanup_jobs);
  DELETE FROM receipts WHERE id IN (SELECT id FROM cleanup_receipts);
  DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM cleanup_payments);
  DELETE FROM consent_records WHERE registration_id IN (SELECT id FROM cleanup_registrations);
  DELETE FROM bib_assignments WHERE registration_id IN (SELECT id FROM cleanup_registrations);
  DELETE FROM checkins WHERE registration_id IN (SELECT id FROM cleanup_registrations);
  DELETE FROM payments WHERE id IN (SELECT id FROM cleanup_payments);
  DELETE FROM registrations WHERE id IN (SELECT id FROM cleanup_registrations);

  INSERT INTO audit_logs (slug, created_at, updated_at, actor_user_id, action_key, entity_type, entity_id, new_json)
    SELECT gen_random_uuid(), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0,
      'maintenance.cleanup.before_date', 'maintenance', cutoff::text,
      jsonb_build_object('cutoff', cutoff, 'payments_deleted', (SELECT count(*) FROM cleanup_payments),
        'registrations_deleted', (SELECT count(*) FROM cleanup_registrations),
        'receipts_deleted', (SELECT count(*) FROM cleanup_receipts))
    FROM cleanup_cutoff;
  COMMIT;
  \echo 'Cleanup committed. Today/newer payments and registrations retained.'
\else
  ROLLBACK;
  \echo 'Preview only. No records changed. Use -v apply=true only after backup and review.'
\endif
