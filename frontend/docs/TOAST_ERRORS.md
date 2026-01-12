# Toast error rules

All API call failures should show a bottom toast.

Message mapping:
- If backend returns `error.message`, show it as the toast title.
- If `status=422` and `details[]` exists, show a concise summary: first issue + “and N more”.
- If network error, show: “Network error — check your connection and try again.”
- Otherwise: “Something went wrong. Please try again.”

Use `toastApiError(toast, err)` from `frontend/lib/toast-api-error.ts`.

