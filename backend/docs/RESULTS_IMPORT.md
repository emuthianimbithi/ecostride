# Results import

Admin flow:
- Upload CSV: `POST /api/v1/admin/events/:id/results/import` (multipart file)
- Publish results: `POST /api/v1/admin/events/:id/results/publish`

Public endpoints:
- `GET /api/v1/public/results/events/:slug`
- `GET /api/v1/public/results/events/:slug/search`
- `GET /api/v1/public/results/events/:slug/leaderboard`

CSV validation and import behavior lives in `backend/internal/results`.

