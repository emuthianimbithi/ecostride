# API error contract

All non-2xx responses return JSON in this shape:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": [{ "field": "optionalField", "issue": "optionalIssue" }]
  }
}
```

## Status code rules
- `400` invalid request / missing params
- `401` auth required / invalid token
- `403` permission denied
- `404` not found
- `409` conflict
- `422` validation failure (`details[]` populated where possible)
- `500` unexpected server error (safe message; no stack traces)

## Examples

### Validation (422)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "Email", "issue": "required" }
    ]
  }
}
```

### Unauthorized (401)
```json
{
  "error": { "code": "UNAUTHORIZED", "message": "Unauthorized" }
}
```

Implementation: `backend/internal/common/http/api_errors.go`.

