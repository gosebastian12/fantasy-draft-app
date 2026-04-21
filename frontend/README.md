# Frontend (`fantasy-draft-frontend`)

Next.js frontend for the fantasy draft app. The app renders a live draft room UI and listens to backend WebSocket channels for real-time picks and trade updates.

## Tech Stack

- Next.js `15`
- React `19`
- TypeScript
- Zustand (client state)
- Tailwind CSS `4` + PostCSS

## Dependencies

Main runtime dependencies from `package.json`:

- `next`
- `react`
- `react-dom`
- `zustand`
- `clsx`

Development dependencies:

- `typescript`
- `tailwindcss`
- `@tailwindcss/postcss`
- `postcss`
- `@types/node`, `@types/react`, `@types/react-dom`

## Environment Variables

- `NEXT_PUBLIC_API_URL` (default: `http://localhost:8000`)

This value is used to derive both:

- HTTP base URL (for API calls)
- WebSocket host (`ws://` or `wss://` is chosen from current browser protocol)

## Run Locally (without Docker)

### 1) Install dependencies

```bash
npm install
```

### 2) Start development server

```bash
npm run dev
```

Frontend will be available at:
`http://localhost:3000`

### 3) Start backend dependencies

The UI expects backend websockets at `NEXT_PUBLIC_API_URL`.
Run backend + infrastructure from repository root:

```bash
docker compose -f ../docker/docker-compose.yml up -d postgres redis backend
```

## Scripts

- `npm run dev` - start dev server with Turbopack
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run Next.js linting

## Docker

The Dockerfile uses multi-stage builds and Next standalone output.

Build and run:

```bash
docker build -t fantasy-draft-frontend --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 .
docker run --rm -p 3000:3000 fantasy-draft-frontend
```

## Deployment Notes

- Build with the correct public API URL for each environment.
- For HTTPS deployments, the app automatically upgrades websocket protocol to `wss`.
- Host frontend behind your edge/load balancer and route backend API/WebSocket traffic consistently.
