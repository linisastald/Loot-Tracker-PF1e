# Docker Security and Optimization Notes

These notes describe the production image built from `docker/Dockerfile.backend` (see `docker/README.md`).

## Security

- **Non-root execution**: the container runs as the `node` user.
- **Minimal base image**: `node:25-alpine`, which keeps the attack surface small.
- **Dev dependencies pruned**: the frontend is built in the image, then dev dependencies are pruned from the final layers.
- **Root `.dockerignore`**: excludes documentation, tests, secrets (`.env*`), git metadata and IDE files from the build context.
- **Security headers and rate limiting**: applied by the Express app itself (Helmet, express-rate-limit), not by a proxy inside the image.
- **Secrets**: never bake secrets into the image; pass them as environment variables at deploy time.

## Build and runtime

- Dependency manifests are copied before the sources so dependency layers stay cached; `npm ci` is used for reproducible installs.
- The image has a healthcheck against `http://localhost:5000/api/health`.
- `build_image.sh` stamps the version into `.docker-version` and tags dev/stable builds.

## Maintenance

- Update the base image regularly and scan images for vulnerabilities (for example with Trivy).
- Rotate secrets regularly.
