# Alexandria Library

## Features

- District-facing admin panel for app approvals, staff management, and activity logs
- Public app library with tags, SOPPA statuses, and search
- District settings for branding, status/tag taxonomies, and logo uploads
- File handling for NDPA/Exhibit E and invoice management
- Auth with session-based login (Google SSO wiring present server-side)

## Quick Start (Docker, SQLite only)

1. Copy `.env.example` to `.env` (or edit the existing one) and set secrets for Flask `SECRET_KEY` and any OAuth keys you use.
2. Build and start the single-container stack (no Postgres dependency):

```
docker compose up --build
```

3. App runs on `http://localhost:80`. All data (including the SQLite DB) is persisted in named volumes.

## Common Workflows

- Admin panel: `/admin` for settings, staff, requests, activity
- Public catalog: `/` (or `/apps`) for the public-facing library
- Uploads/docs: NDPA, Exhibit E, and invoices managed via admin edit flows and stored under `static/`

## Tips

- Replace placeholder secrets in `.env` before deploying.
- If sessions fail locally, ensure `VITE_API_BASE_URL` and Flask host align so cookies stay same-site.
- In Docker, PostgreSQL is mapped to host port `5433` (see `docker-compose.yml`).
