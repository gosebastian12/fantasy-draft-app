# Fantasy Draft App

Monorepo for a real-time fantasy football draft experience:

- `backend/`: FastAPI + SQLAlchemy async API with Redis-backed WebSocket fan-out.
- `frontend/`: Next.js 15 (React 19) UI for the live draft room.
- `docker/`: Docker Compose stack for local containerized development.

## Architecture At A Glance

- **Frontend** connects to backend HTTP + WebSocket endpoints.
- **Backend** serves API/WebSocket endpoints and publishes/consumes draft events via Redis Pub/Sub.
- **Postgres** stores relational draft data.
- **Redis** powers cross-instance real-time event fan-out.

## Dependencies

### System dependencies

- Node.js `20+` and npm (frontend local development)
- Python `3.12` and `uv` (backend local development)
- Docker + Docker Compose (containerized development and deployment)
- Optional: `curl` for smoke tests

### Runtime services

- PostgreSQL `16`
- Redis `7`

## Monorepo Layout

```text
.
├── backend/                # FastAPI service
├── frontend/               # Next.js app
└── docker/
    └── docker-compose.yml  # Full local stack (postgres, redis, backend, frontend)
```

## Running Locally

You can run the stack with Docker (recommended) or run each service manually.

### Option A: Docker Compose (recommended)

From the repository root:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8000/health`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

To stop:

```bash
docker compose -f docker/docker-compose.yml down
```

### Option B: Run backend + frontend manually

1. Start Postgres + Redis yourself (Docker Desktop, local installs, or services).
2. Follow setup steps in:
   - `backend/README.md`
   - `frontend/README.md`

## Environment Configuration

Most defaults are development-friendly. Override as needed:

- Backend:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `JWT_SECRET`
  - `APP_NAME`, `DEBUG`, and related settings
- Frontend:
  - `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000`)

See service-specific README files for details.

## Deployment Strategy

Current repository includes container-first deployment assets:

- Backend and frontend each ship with production-oriented Dockerfiles.
- Compose demonstrates a full multi-service topology and can be adapted for staging/prod.
- Frontend is built using Next.js standalone output for lean runtime images.
- Backend runs with `uvicorn` and consumes environment variables for externalized config.

### Recommended production approach

1. Build and push backend/frontend images from CI.
2. Use managed Postgres + Redis (or hardened self-hosted instances).
3. Inject secrets (`JWT_SECRET`, DB credentials, etc.) via your platform secret manager.
4. Run one or more backend replicas behind a load balancer; Redis Pub/Sub preserves cross-replica event fan-out.
5. Serve frontend from container platform, Vercel-compatible environment, or edge/runtime setup.

## Smoke Test (Realtime Flow)

After starting services, publish sample events:

```bash
curl -X POST "http://localhost:8000/internal/dev/publish-draft-event/00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{"round":1,"overall":1,"team":"Demo Team","player":"Demo Player"}'

curl -X POST "http://localhost:8000/internal/dev/publish-trade-event/00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{"summary":"Team A trades pick 1.03 to Team B"}'
```

Then open `http://localhost:3000` and verify the UI receives updates.