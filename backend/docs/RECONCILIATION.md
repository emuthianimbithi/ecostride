# Reconciliation

Admin flow:
- Import bank statement: `POST /api/v1/admin/reconciliation/import` (multipart file)
- Match a row to a payment: `POST /api/v1/admin/reconciliation/match`
- Resolve discrepancies: `POST /api/v1/admin/reconciliation/resolve`

The reconciliation feature helps reconcile bank deposits against recorded payments.

