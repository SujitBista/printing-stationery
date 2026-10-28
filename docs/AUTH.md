# Authentication

This project uses opaque, server-managed sessions (not JWTs in the browser).

## Account model

The Corporate Checker — the active supervisor of the Corporate Store — is the head. That account administers organization setup, application users, store users, and opening stock. That account may also hold `ADMIN` and still sign in. A standalone `ADMIN` account cannot sign in.

### Employee application user (Application User Setup)

Ordinary users created through Application User Setup:

- Must reference an existing active Employee (`employeeId` required)
- Receive exactly one application role: `HR`, `MAKER`, or `CHECKER`
- Must not be created with `employeeId = null`
- Must change the temporary password on first login

Application User Setup:

- Selects an existing active Employee (employees who already have an account are excluded)
- Requires an Employee ID
- Prevents one Employee from having multiple accounts
- Stores only a password hash; never returns the password or hash
- Assigns one of `HR`, `MAKER`, or `CHECKER`. `ADMIN` cannot be assigned
- Never offers “No Employee”
- Does not permanently delete accounts; inactive users cannot log in
- Is Corporate Checker only (`HR` cannot create accounts or assign roles)

## Environment variables

| Variable | Where | Purpose | Default / notes |
|---|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL connection | required |
| `FRONTEND_ORIGIN` | backend | Allowed CORS origin + CSRF Origin/Referer check | `http://localhost:3000` |
| `SESSION_COOKIE_NAME` | backend | HttpOnly session cookie name | `ps_session` |
| `SESSION_DURATION_HOURS` | backend | Session lifetime | `8` |
| `COOKIE_SECURE` | backend | `Secure` cookie flag | `true` in production, else `false` |
| `SESSION_LAST_SEEN_THROTTLE_SECONDS` | backend | Throttle for `last_seen_at` updates | `300` |
| `NEXT_PUBLIC_API_URL` | frontend | Backend origin for API calls | `http://localhost:3001` |
| `NEXT_PUBLIC_SESSION_COOKIE_NAME` | frontend | Cookie name for soft route gating | `ps_session` |

Never commit real credentials.

## Session and cookie behavior

1. Login verifies the password (Argon2id).
2. Backend creates a random opaque session token.
3. Only the SHA-256 hash of the token is stored in `auth_sessions`.
4. The browser receives the raw token in an HttpOnly cookie:
   - `HttpOnly=true`
   - `SameSite=Lax`
   - `Secure` per `COOKIE_SECURE` / production default
   - `Path=/`
   - Max-Age aligned with `SESSION_DURATION_HOURS`
5. No parent `Domain` attribute is set.
6. Protected APIs resolve the session from the cookie; expired or revoked sessions return `401`.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/auth/login` | public | Sets session cookie; returns safe user |
| `POST` | `/api/auth/logout` | optional session | Revokes current session; clears cookie; idempotent |
| `GET` | `/api/auth/me` | session | Current user with roles and whether they are the Corporate Checker |
| `POST` | `/api/auth/change-initial-password` | session | Initial password change |
| `GET` | `/api/application-users` | Corporate Checker | Paginated Application User Setup list |
| `GET` | `/api/application-users/eligible-employees` | Corporate Checker | Active employees without an application account |
| `GET` | `/api/application-users/:id` | Corporate Checker | Safe user payload (no password or hash) |
| `POST` | `/api/application-users` | Corporate Checker | Create employee-linked account |
| `PATCH` | `/api/application-users/:id` | Corporate Checker | Update username and role |
| `PATCH` | `/api/application-users/:id/status` | Corporate Checker | Activate or deactivate |
| `POST` | `/api/application-users/:id/reset-password` | Corporate Checker | Set a temporary password; `mustChangePassword=true` |

## Bootstrap

The system admin bootstrap command no longer creates a login. The Corporate Checker administers the system.

## Initial login flow

```text
Corporate Checker (supervisor of the Corporate Store) signs in
→ Changes the temporary password when required
→ Administers branches, employees, stores, and application users
```

## Lockout policy

- After **5** failed login attempts, the account is locked for **15** minutes.
- Failed attempts are incremented with an atomic update.
- Successful login resets failed attempts and clears lock state.
- Locked, inactive user, inactive employee, and standalone `ADMIN` role failures use the generic message: `Invalid username or password.`

## Initial password behavior

Application User Setup (create or password reset) sets `mustChangePassword=true`.

Until the password is changed:

- Frontend redirects authenticated users to `/change-initial-password`
- Normal application routes are blocked by the authenticated layout

On successful change:

- `mustChangePassword` becomes `false`
- `passwordChangedAt` is set
- **Other sessions are revoked; the current session remains active**

## Authenticated user response

Safe user payload (no password hashes, login-attempt fields, or session hashes):

- Employee-linked user: `employee` with id, code, name, and branch summary
- `isCorporateChecker` is true when the user supervises the Corporate Store

## Audit identity

Future audit fields should reference `application_users.id`, not require `employees.id`.

For Employee-linked users, reports may additionally display Employee name, code, and branch.

## Local development (cross-origin cookies)

Development uses:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

Cookie auth therefore requires:

- Backend CORS `credentials: true` with a specific `FRONTEND_ORIGIN` (never `*`)
- Frontend `fetch(..., { credentials: "include" })`
- CSRF Origin/Referer validation on state-changing requests

## Production HTTPS

Set `COOKIE_SECURE=true` (default when `NODE_ENV=production`) and serve the API over HTTPS so browsers accept the Secure cookie.

## Session cleanup

Expired and long-revoked sessions are not deleted by an always-on timer (which would be unsafe across multiple instances).

Run periodically (cron/job runner):

```bash
npm run auth:cleanup-sessions -w @printing-stationery/backend
```

## Roles

Application roles (not employee types): `HR`, `MAKER`, `CHECKER`. A standalone `ADMIN` account cannot sign in. The Corporate Checker may hold `ADMIN` in addition to `CHECKER`.

Branch vs Head Office maker/checker is derived later from role plus the employee’s branch. Separate `BRANCH_MAKER` / `HEAD_OFFICE_MAKER` / `BRANCH_CHECKER` / `HEAD_OFFICE_CHECKER` roles are not used.

Master-data API policy at this stage:

- `GET`: authenticated `ADMIN`, `MAKER`, or `CHECKER` (needed on request and issue screens)
- `POST` / `PATCH` / status: Corporate Checker only
- Organization Setup screens (branches, departments, units, item groups, items, stores, employees, application users, store users): Corporate Checker only. Branch makers and checkers cannot open these screens.
- Application User Setup: Corporate Checker only. `HR` will maintain Employee Setup later, but cannot create application accounts or assign roles.

UI visibility is convenience only; backend authorization is authoritative. The Corporate Checker is the active supervisor of the Corporate Store.

## CSRF defense

State-changing requests must include an `Origin` or `Referer` matching `FRONTEND_ORIGIN`. Missing or mismatched values return `403`. `SameSite=Lax` is complementary, not the sole defense.
