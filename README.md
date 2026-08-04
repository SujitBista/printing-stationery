# Printing Stationery

npm workspaces monorepo for a printing and stationery inventory system.

## Packages

| Package | Description |
|---|---|
| `frontend` | Next.js App Router UI (TypeScript + Tailwind CSS v4) |
| `backend` | Express.js API (TypeScript + Drizzle ORM + PostgreSQL) |
| `packages/shared` | Shared Zod schemas and TypeScript types |

## Prerequisites

- Node.js 20+
- PostgreSQL running locally (or reachable via `DATABASE_URL`)

## Setup

1. Copy environment files:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

2. Edit `.env` / `backend/.env` with your PostgreSQL connection string if needed.

3. Install dependencies from the repo root:

```bash
npm install
```

## Development

```bash
npm run dev
```

This builds (then watches) the shared package, then starts:

- Backend API at [http://localhost:3001](http://localhost:3001)
- Frontend at [http://localhost:3000](http://localhost:3000)

Health check: [http://localhost:3001/api/health](http://localhost:3001/api/health)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Build/watch shared, then run backend + frontend |
| `npm run build` | Build shared → backend → frontend |
| `npm run lint` | Lint all workspaces |
| `npm run typecheck` | Type-check all workspaces |
| `npm run clean` | Remove build outputs (`dist`, `.next`) only |

## Notes

- `JWT_SECRET` and `JWT_EXPIRES_IN` are documented for future authentication and are not required in this milestone.
- No database migrations or inventory tables are created in this foundation.
- CORS allows `http://localhost:3000` for the Next.js frontend.
