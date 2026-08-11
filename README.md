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

4. Apply database migrations:

```bash
npm run db:migrate -w @printing-stationery/backend
```

5. Bootstrap the first Admin (independent system account; no Employee required):

```bash
BOOTSTRAP_ADMIN_USERNAME="<admin-username>" \
BOOTSTRAP_ADMIN_PASSWORD="<strong-temporary-password>" \
npm run auth:bootstrap-admin -w @printing-stationery/backend
```

On first login the Admin must change the temporary password, then receives full `ADMIN` access. Ordinary users created later through Application User Setup must reference an Employee. See [docs/AUTH.md](docs/AUTH.md).

## Development

```bash
npm run dev
```

This builds (then watches) the shared package, then starts:

- Backend API at [http://localhost:3001](http://localhost:3001)
- Frontend at [http://localhost:3000](http://localhost:3000)

Health check: [http://localhost:3001/api/health](http://localhost:3001/api/health)

Sign in: [http://localhost:3000/login](http://localhost:3000/login)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Build/watch shared, then run backend + frontend |
| `npm run build` | Build shared → backend → frontend |
| `npm run lint` | Lint all workspaces |
| `npm run typecheck` | Type-check all workspaces |
| `npm run clean` | Remove build outputs (`dist`, `.next`) only |
| `npm run db:generate -w @printing-stationery/backend` | Generate Drizzle migrations from the schema |
| `npm run db:migrate -w @printing-stationery/backend` | Apply pending Drizzle migrations to PostgreSQL |
| `npm run auth:bootstrap-admin -w @printing-stationery/backend` | Create the first Admin application user |
| `npm run auth:cleanup-sessions -w @printing-stationery/backend` | Remove expired / long-revoked sessions |

## Database migrations

Generate and apply migrations from the repo root (requires `DATABASE_URL` in `.env` or `backend/.env`):

```bash
npm run db:generate -w @printing-stationery/backend
npm run db:migrate -w @printing-stationery/backend
```

Inspect generated SQL under `backend/drizzle/` before applying.

## Notes

- Authentication uses opaque HttpOnly session cookies. Details: [docs/AUTH.md](docs/AUTH.md).
- Organization master-data APIs require authentication. Mutations require `ADMIN`.
- CORS allows the configured `FRONTEND_ORIGIN` (default `http://localhost:3000`) with credentials.
