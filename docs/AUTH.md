# Authentication

This project uses opaque, server-managed sessions (not JWTs in the browser).

## Account model

The system has two account models.

### Independent system Admin

Created only by the first-Admin bootstrap command:

- Application account with username, password hash, and `ADMIN` role
- `employeeId = null` (does not represent an Employee)
- Must change the temporary password on first login
- After password change, has full `ADMIN` access
- Uses the application-user identity for future audit records
- Remains unlinked permanently unless a separately confirmed future requirement changes this

The Admin must never be required to create, select, or link an Employee for themselves.

### Employee application user (Application User Setup)

Ordinary users created through Application User Setup:

- Must reference an existing active Employee (`employeeId` required)
- Receive exactly one application role: `ADMIN`, `HR`, `MAKER`, or `CHECKER`
- Must not be created with `employeeId = null`
- Must not use the bootstrap command
- Must change the temporary password on first login

```text
Bootstrap Admin:
employeeId = null is allowed.

Any account created through Application User Setup:
employeeId is required.
```

Application User Setup:

- Selects an existing active Employee (employees who already have an account are excluded)
- Requires an Employee ID
- Prevents one Employee from having multiple accounts
- Stores only a password hash; never returns the password or hash
- Assigns one of `ADMIN`, `HR`, `MAKER`, `CHECKER`
- Never offers “No Employee”
- Never creates another independent Admin (`employeeId = null`) through ordinary UI
- Does not permanently delete accounts; inactive users cannot log in
- Is Admin-only (`HR` cannot create accounts or assign roles)

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
| `BOOTSTRAP_ADMIN_USERNAME` | bootstrap script | Admin username | required for bootstrap |
| `BOOTSTRAP_ADMIN_PASSWORD` | bootstrap script | Admin temporary password (shared rules) | required for bootstrap |

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
| `GET` | `/api/auth/me` | session | Current user with roles; `employee` may be `null` for the bootstrap Admin |
| `POST` | `/api/auth/change-initial-password` | session | Initial password change |
| `GET` | `/api/application-users` | `ADMIN` | Paginated Application User Setup list |
| `GET` | `/api/application-users/eligible-employees` | `ADMIN` | Active employees without an application account |
| `GET` | `/api/application-users/:id` | `ADMIN` | Safe user payload (no password or hash) |
| `POST` | `/api/application-users` | `ADMIN` | Create employee-linked account |
| `PATCH` | `/api/application-users/:id` | `ADMIN` | Update username and role |
| `PATCH` | `/api/application-users/:id/status` | `ADMIN` | Activate or deactivate |
| `POST` | `/api/application-users/:id/reset-password` | `ADMIN` | Set a temporary password; `mustChangePassword=true` |

## Bootstrap first Admin

Creates the independent system Admin. Does **not** require an Employee. Does not create Employees, Branches, or sample data.

```bash
BOOTSTRAP_ADMIN_USERNAME="<admin-username>" \
BOOTSTRAP_ADMIN_PASSWORD="<strong-temporary-password>" \
npm run auth:bootstrap-admin -w @printing-stationery/backend
```

Behavior:

- Creates exactly one application user with `employee_id = NULL`, `is_active = true`, `must_change_password = true`
- Assigns only the `ADMIN` role
- Refuses if any application user already exists
- Uses a transaction advisory lock so concurrent bootstrap attempts cannot create multiple Admins
- Never prints the password or hash
- Never becomes a general Admin-creation command

## Initial login flow

```text
Fresh installation
→ Run bootstrap Admin command
→ Admin logs in
→ Admin changes the temporary password
→ Admin receives full ADMIN access
→ Admin creates Branches and Employees when needed
→ Admin later creates Employee-linked application users
```

The only initial restriction is `mustChangePassword = true`. A missing Employee does not restrict the independent Admin.

## Lockout policy

- After **5** failed login attempts, the account is locked for **15** minutes.
- Failed attempts are incremented with an atomic update.
- Successful login resets failed attempts and clears lock state.
- Locked, inactive user, and (for Employee-linked accounts) inactive employee failures use the generic message: `Invalid username or password.`
- The independent Admin is not affected by Employee active status because it has no Employee.

## Initial password behavior

Bootstrap and Application User Setup (create or password reset) set `mustChangePassword=true`.

Until the password is changed:

- Frontend redirects authenticated users to `/change-initial-password`
- Normal application routes are blocked by the authenticated layout

On successful change:

- `mustChangePassword` becomes `false`
- `passwordChangedAt` is set
- **Other sessions are revoked; the current session remains active**
- The independent Admin receives normal full `ADMIN` access

## Authenticated user response

Safe user payload (no password hashes, login-attempt fields, or session hashes):

- Independent Admin: `employee: null`
- Employee-linked user: `employee` with id, code, name, and branch summary

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

Application roles (not employee types): `ADMIN`, `HR`, `MAKER`, `CHECKER`.

Branch vs Head Office maker/checker is derived later from role plus the employee’s branch. Separate `BRANCH_MAKER` / `HEAD_OFFICE_MAKER` / `BRANCH_CHECKER` / `HEAD_OFFICE_CHECKER` roles are not used.

Master-data API policy at this stage:

- `GET`: authenticated `ADMIN`, `MAKER`, or `CHECKER`
- `POST` / `PATCH` / status: `ADMIN` only
- Application User Setup: `ADMIN` only. `HR` will maintain Employee Setup later, but cannot create application accounts or assign roles.

UI visibility is convenience only; backend authorization is authoritative. Authorization uses database-derived roles; a null `employee_id` does not restrict `ADMIN`.

## CSRF defense

State-changing requests must include an `Origin` or `Referer` matching `FRONTEND_ORIGIN`. Missing or mismatched values return `403`. `SameSite=Lax` is complementary, not the sole defense.
