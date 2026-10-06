# Security

This document describes the security measures the Pathfinder Loot Tracker implements, how to deploy it safely, and how to report a problem. It lists only what exists in the code; items not yet implemented are under "Not implemented".

## Implemented protections

### Database

- All queries use parameterized statements. Dynamic table and column names go through the whitelist validators in `backend/src/utils/dbUtils.js` (allowed-table set plus an identifier pattern check).
- Campaign data is isolated with PostgreSQL row-level security. The application connects as a non-owner role (`DB_APP_USER`, created by `database/setup_app_role.sql`) so the policies are enforced; migrations run with the owner credentials. Without `DB_APP_USER`/`DB_APP_PASSWORD` the app runs as the owner and RLS is bypassed, so set both in production.

### Authentication and authorization

- JWTs are delivered in an HTTP-only cookie (`authToken`); a `Bearer` header is also accepted.
- Passwords are hashed with bcryptjs (10 rounds), NFC-normalized. A password change ends earlier sessions.
- Accounts lock temporarily after repeated failed logins.
- Roles are per campaign (`user_campaign.role`: DM or Player) plus a global superadmin flag (`users.is_superadmin`). `backend/src/middleware/auth.js` resolves the membership on every request; `checkRole` gates DM-only routes.
- Global settings and secrets are superadmin-only.

### Requests and API

- CSRF protection uses the double-submit cookie pattern (`csrf-csrf`, `backend/index.js`). The frontend fetches a token from `/api/csrf-token` and sends it in `X-CSRF-Token`. Auth endpoints, the public config route and the Discord interactions POST (a service-to-service call) are excluded. Set `CSRF_SECRET`; without it a random per-process secret is used and tokens stop working after a restart.
- Rate limiting: a global limiter plus a stricter limiter on authentication endpoints (`express-rate-limit`).
- CORS accepts only origins listed in `ALLOWED_ORIGINS`.
- JSON and URL-encoded bodies are limited to 10 MB; JSON parsing is strict (objects and arrays only).
- Input is validated by the validation middleware and in controllers; coverage is not uniform across every endpoint.

### Security headers (Helmet)

Content-Security-Policy, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, `Referrer-Policy: same-origin`; `X-Powered-By` is removed.

### Container

The image (`docker/Dockerfile.backend`) runs as the unprivileged `node` user and has an `/api/health` healthcheck. See `docker/DOCKER_SECURITY_OPTIMIZATIONS.md`.

## Deploying safely

1. Generate secrets: `bash docker/generate-secrets.sh` prints random values for `JWT_SECRET`, `CSRF_SECRET` and the database passwords.
2. Supply the variables listed in `backend/.env.example` / `docker/.env.docker.example` through your container or app definition. Never commit real `.env` files, compose files or app definitions that contain secrets.
3. Set `NODE_ENV=production`, use `https://` origins in `ALLOWED_ORIGINS`, and terminate HTTPS at your reverse proxy.
4. Restrict network access to the database and the Discord broker; set the same `DISCORD_BROKER_SECRET` on the broker and on every backend.
5. Rotate secrets periodically, keep dependencies updated (`npm audit` in `backend/` and `frontend/`), review the logs, and keep database backups encrypted.

## Reporting a vulnerability

Please do not open a public issue. Contact the repository owner privately (for example through the private contact method on the owner's profile) with the details and steps to reproduce.

## Not implemented

Ideas that are not part of the application today: a web application firewall, API versioning, request signing, a full audit log of data changes, and two-factor authentication.
