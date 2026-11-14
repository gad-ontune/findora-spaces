# Findora Spaces

Findora Spaces is a Kenyan property discovery and assisted house-finding platform. It combines public rental search, evidence-based Property Passports, fresh availability confirmation, assisted search with vetted local partners, viewings, notifications and M-Pesa payments in one application.

The first launch market is **Kehancha, Migori County**. The location model covers all 47 Kenyan counties and can expand to other towns without schema changes.

> **Demo data:** every listing, photo, verification record, review and payment in the seeded environment is fictional sample data. Nothing in the demo represents a real property or a real payment.

## Stack

| Layer | Technology |
| --- | --- |
| API | FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Data | PostgreSQL 16 + PostGIS 3.4, Redis 7 |
| Async work | Celery worker and beat |
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS |
| Maps | MapLibre GL |
| Tests | Pytest, API smoke suite, Playwright |

The backend is a modular monolith with a versioned API under `/api/v1`. The frontend proxies `/api/v1` and `/media` to FastAPI so session cookies remain same-origin.

## Repository layout

```
backend/            FastAPI application, models, services, tasks, migrations, seed
  app/api/v1/       HTTP routers
  app/tests/        Pytest suite
  scripts/smoke.py  End-to-end API smoke checks
frontend/           Next.js PWA
  app/              Public pages, dashboards, partner and admin consoles
  components/       UI, search, property, dashboard and admin components
  e2e/              Playwright critical journeys
docker-compose.yml  Postgres, Redis, API, worker, beat and frontend
.env.example        Development configuration template
```

## Quick start with Docker Compose

Requirements: Docker with Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

The API container runs `alembic upgrade head`, seeds demo data only when the database is empty (`python -m app.seed --if-empty`), then starts Uvicorn. The frontend is built as a standalone Next.js image.

| Service | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |

Stop the stack with `docker compose down`. Add `-v` only when you deliberately want to delete the Postgres and Redis volumes.

## Local development

### 1. Start data stores

```bash
docker compose up -d db redis
```

Postgres is exposed on host port **5455** and Redis on **6380**.

### 2. Backend

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp ../.env.example ../.env        # if .env does not exist yet
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed      # first run only
.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check: `curl http://127.0.0.1:8000/health`.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local        # if .env.local does not exist yet
npm run dev
```

Open http://localhost:3000. The browser uses the relative API base `/api/v1`, which Next.js rewrites to `BACKEND_URL` (default `http://127.0.0.1:8000`).

### Production build locally

```bash
cd frontend
npm run build
npm run start
```

The Docker image uses the standalone output (`node .next/standalone/server.js`). `npm run start` is convenient for local verification.

## Demo accounts

All accounts use the same password pattern shown below. Sign in with the phone number or email.

| Role | Phone | Email | Password |
| --- | --- | --- | --- |
| Super admin | `+254700000001` | `admin@findora.co.ke` | `Admin123!` |
| Landlord | `+254700000002` | `landlord@findora.co.ke` | `Landlord123!` |
| Landlord | `+254700000003` | `landlord2@findora.co.ke` | `Landlord123!` |
| Property manager | `+254700000004` | `manager@findora.co.ke` | `Manager123!` |
| Seeker | `+254700000005` | `seeker@findora.co.ke` | `Seeker123!` |
| Finding partner | `+254700000006` | `partner@findora.co.ke` | `Partner123!` |
| Data partner | `+254700000007` | `data@findora.co.ke` | `Data123!` |
| Support agent | `+254700000008` | `support@findora.co.ke` | `Support123!` |
| Verifier | `+254700000009` | `verifier@findora.co.ke` | `Verify123!` |
| Moderator | `+254700000010` | `moderator@findora.co.ke` | `Moderate123!` |
| Finance officer | `+254700000011` | `finance@findora.co.ke` | `Finance123!` |

Staff sign in to `/admin`; partners sign in to `/partner`; landlords and managers land in the listing workspace; seekers land on `/dashboard`.

## Seeding and resetting demo data

```bash
cd backend
.venv/bin/python -m app.seed           # seed only when the database is empty
.venv/bin/python -m app.seed --if-empty
.venv/bin/python -m app.seed --reset   # destructive: drops and recreates all tables
```

`--reset` is refused when `ENVIRONMENT=production`. Restart the API after a reset if it is running.

The seed creates 47 counties, Kehancha/Migori neighbourhoods and landmarks, amenities, commercial uses, 11 demo users, 23 fictional properties with media, verification evidence, enquiries, favourites, shortlists, assisted requests, partner assignments and field reports, viewings, payments, invoices, a refund, complaints, reports, support tickets, notifications and audit records. Demo media are generated illustrative WebP images, not real property photos.

## Tests

### Backend unit and integration tests

```bash
cd backend
.venv/bin/python -m pytest app/tests --tb=short -q -p no:logging
```

The test suite uses the `findora_test` database and recreates it, so the development data is not touched. Postgres must be running on port 5455.

### API smoke suite

With the API running on `127.0.0.1:8000`:

```bash
cd backend
.venv/bin/python scripts/smoke.py
```

This exercises public discovery, authentication, listings, moderation, verification, assisted search, partner operations, finance, RBAC, notifications and the admin endpoints.

### Playwright critical journeys

With the web app and API running (the config reuses an existing server at `http://127.0.0.1:3000`):

```bash
cd frontend
npx playwright install chromium   # first run only
npm run test:e2e
```

The journeys cover public discovery and the Property Passport, seeker and landlord sign-in, assisted search submission, and admin RBAC.

### Type checking and linting

```bash
cd frontend
npm run typecheck
npm run lint
```

## Payments, notifications and external providers

Development defaults are deliberately offline:

- `MPESA_MOCK=true` completes the M-Pesa payment flow without calling Daraja.
- `SMS_PROVIDER=mock`, `EMAIL_PROVIDER=mock` and `WHATSAPP_PROVIDER=mock` log messages instead of sending them.
- `OTP_DEBUG=true` exposes development OTP behaviour for testing.

To use real providers, set the corresponding credentials and callback values in `.env`. The callback endpoint is `/api/v1/payments/callback` and is protected by `MPESA_CALLBACK_SECRET`.

## Configuration notes

- **Sessions:** cookie-based sessions with Argon2id password hashing and double-submit CSRF (`findora_csrf` cookie plus `X-CSRF-Token` header). Set `COOKIE_SECURE=true` behind HTTPS in production.
- **Uploads:** local filesystem under `backend/uploads` in development. Set the S3 settings and `CDN_BASE_URL` for object storage.
- **Freshness:** public listings must be approved, genuinely available and confirmed within `DEFAULT_FRESHNESS_DAYS` (default 14). Changing a setting never bypasses moderation or verification.
- **Locations:** all counties are seeded; add towns and neighbourhoods through the data model without changing the API contract.
- **Migrations:** the Alembic migration is the source of schema. Run `alembic upgrade head` before starting a new API version.

## Production checklist

1. Replace `SECRET_KEY` with a long random value.
2. Set `ENVIRONMENT=production`, `DEBUG=false`, `COOKIE_SECURE=true` and the real `FRONTEND_URL`/`CORS_ORIGINS`.
3. Configure a managed PostGIS database and Redis, and set `DATABASE_URL` and `REDIS_URL`.
4. Set real M-Pesa, SMS, email, WhatsApp and map provider credentials. Set `MPESA_MOCK=false`.
5. Use S3-compatible storage or a persistent volume for uploads and back it up.
6. Run the API, Celery worker and Celery beat as separate services.
7. Terminate TLS at a reverse proxy and keep `/api/` same-origin through the Next.js rewrite.
8. Back up Postgres and verify restore procedures before launch.
9. Run `pytest`, the smoke suite and the Playwright journeys against staging.

## Safety and data honesty

Findora does not invent property data, verification outcomes, availability, matches or payment success. Public search only returns approved listings whose availability has been freshly confirmed. Verification evidence is shown as recorded, with its limits. Assisted matches are only shared when a real partner or staff member has recorded them.

Verification reduces risk but does not guarantee a property. Always inspect a property and never send money before viewing and confirming ownership.
