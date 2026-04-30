# Deployment Guide

## GitHub Container Registry (GHCR)

Images are automatically built and pushed to `ghcr.io/kuonirad/mcop-framework-2.0` on:
- Pushes to the `main` branch (tagged as `latest`)
- Tagged releases (e.g., `v2.0.0`, tagged as `2.0.0` and `2.0`)

**Important:** All publishes require manual approval via the "production" GitHub Environment.

### Setup Instructions

1.  **Configure Environment**:
    - Go to Repository Settings > Environments.
    - Create a new environment named **production**.
    - Under "Deployment protection rules", add **Required reviewers** and select the repository maintainer (e.g., `@Kuonirad`).
    - Under "Deployment branches and tags", select "Selected branches and tags" and add:
        - `main`
        - `v*` (Tag pattern)

2.  **Triggering a Release**:
    - Ensure your working directory is clean.
    - Run the helper script:
      ```bash
      ./scripts/release.sh 2.0.0
      ```
    - This will create a git tag and push it to origin, triggering the `publish.yml` workflow.

3.  **Approving the Deployment**:
    - Navigate to the "Actions" tab in the repository.
    - Click on the running "Publish Container" workflow.
    - You will see a "Review deployments" button. Click it and approve the deployment to `production`.

## Local/Docker Deployment

For local testing or development, use Docker Compose:

```bash
# Start the full stack
docker compose up -d

# View logs
docker compose logs -f
```

## Monitoring & Observability

The application uses **Pino** for structured, JSON-based logging.

- **Logs** include provenance data (input length, entropy, tensor hash) for core meta-cognitive operations (e.g., NOVA-NEO encoding).
- **Environment**: Set `LOG_LEVEL=debug` to see detailed provenance logs. In production, logs are output as raw JSON for ingestion by aggregation tools (e.g., ELK, Datadog, CloudWatch).
