# Docker

The application ships as a single Node.js container: the Express backend serves both the API (`/api/*`) and the built React frontend on port 5000. There is no nginx layer in the image; an external proxy handles routing.

## Files

- `Dockerfile.backend` - the production image (frontend build + backend). Built by `build_image.sh` from the repository root.
- `../discord-handler/Dockerfile` - the Discord broker image, also built by `build_image.sh`.
- `.env.docker.example` - reference list of environment variables (copy to `.env.docker` and fill in; never commit the real file).
- `generate-secrets.sh` - prints random values for JWT secrets and database passwords.
- `.gitignore` - keeps real `.env` and compose files (which hold secrets) out of version control.

## Building

```bash
bash build_image.sh --branch master --tag latest
```

See `build_image.sh --help` for dev/stable builds and the Discord broker image.

## Deployment

The application is deployed from app definitions (for example TrueNAS apps) that are kept outside git because they contain environment-specific values and secrets; this repository does not ship a compose file for the application itself. The Discord broker image (`discord-handler/Dockerfile`) is deployed the same way; `.env.discord-broker.example` lists its settings. The backend applies pending migrations (`backend/migrations/`, tracked in `schema_migrations_v2`) on every start and should connect as the non-owner `loot_app` role so row-level security is enforced. See `database/DATABASE_SETUP.md` for how a fresh database is initialised.

## Security Notes

- Never commit real `.env` files or compose files containing secrets.
- Use strong, unique passwords and secrets.
- The container runs as the unprivileged `node` user and has a `/api/health` healthcheck.
