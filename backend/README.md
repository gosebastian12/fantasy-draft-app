# Backend (`fantasy-draft-api`)

FastAPI backend for the fantasy draft app. Provides:

- API health endpoint
- WebSocket draft and trade channels
- Redis Pub/Sub bridge for multi-instance real-time fan-out
- SQLAlchemy async database foundation

## Tech Stack

- Python `3.12`
- FastAPI
- SQLAlchemy `2.x` (async) + `asyncpg`
- Redis (`redis-py` asyncio client)
- Alembic (available for migrations)
- `uv` for dependency management and execution

## Dependencies

Defined in `pyproject.toml`:

- `fastapi`
- `uvicorn[standard]`
- `sqlalchemy[asyncio]`
- `asyncpg`
- `alembic`
- `redis[hiredis]`
- `PyJWT[crypto]`
- `httpx`
- `arq`
- `pydantic-settings`
- `email-validator`

## Environment Variables

The app reads `.env` (optional) and environment variables.

- `APP_NAME` (default: `Fantasy Draft API`)
- `DEBUG` (default: `false`)
- `DATABASE_URL` (default: `postgresql+asyncpg://draft:draft@localhost:5432/fantasy_draft`)
- `REDIS_URL` (default: `redis://localhost:6379/0`)
- `JWT_SECRET` (default: `change-me-in-production`, minimum 16 chars)
- `JWT_ALGORITHM` (default: `HS256`)
- `JWT_EXPIRE_MINUTES` (default: `10080`)
- `RESEND_API_KEY` (optional)
- `OTP_EMAIL_FROM` (default: `draft@example.com`)
- `OTP_KEY_PREFIX` (default: `otp:`)

## Run Locally (without Docker)

### 1) Install dependencies

```bash
uv sync
```

### 2) Ensure infrastructure is running

Start Postgres and Redis locally (or via Docker):

```bash
docker compose -f ../docker/docker-compose.yml up -d postgres redis
```

### 3) Start the API

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4) Verify

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

## WebSocket Endpoints

- Draft events: `/ws/draft/{league_id}`
- Trade feed: `/ws/trades/{league_id}`

`league_id` is a UUID. Example dev league:
`00000000-0000-0000-0000-000000000001`

## Dev Event Publishing Endpoints

Temporary helper endpoints for testing UI realtime updates:

- `POST /internal/dev/publish-draft-event/{league_id}`
- `POST /internal/dev/publish-trade-event/{league_id}`

Example:

```bash
curl -X POST "http://localhost:8000/internal/dev/publish-draft-event/00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{"round":1,"overall":1,"team":"Demo Team","player":"Demo Player"}'
```

## Docker

Build and run backend image:

```bash
docker build -t fantasy-draft-backend .
docker run --rm -p 8000:8000 \
  -e DATABASE_URL="postgresql+asyncpg://draft:draft@host.docker.internal:5432/fantasy_draft" \
  -e REDIS_URL="redis://host.docker.internal:6379/0" \
  -e JWT_SECRET="replace-with-strong-secret" \
  fantasy-draft-backend
```

## Deployment Notes

- Use managed Postgres + Redis for reliability.
- Always set a strong `JWT_SECRET` in production.
- Run multiple backend replicas behind a load balancer.
- Keep Redis reachable by all backend replicas so websocket fan-out remains consistent.
