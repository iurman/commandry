# syntax=docker/dockerfile:1.7

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS dependency-cache
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN corepack enable && pnpm fetch --frozen-lockfile

FROM dependency-cache AS build
COPY . .
RUN pnpm install --offline --frozen-lockfile \
    && mkdir -p apps/web/public \
    && pnpm build

FROM dependency-cache AS worker-deps
COPY . .
RUN CI=true pnpm --filter @commandry/worker... install --prod --offline --frozen-lockfile

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS runtime
WORKDIR /app
ARG COMMANDRY_SOURCE_REVISION=unknown
ARG COMMANDRY_SOURCE_CLEAN=false
LABEL org.opencontainers.image.revision="$COMMANDRY_SOURCE_REVISION" \
      org.commandry.source.clean="$COMMANDRY_SOURCE_CLEAN"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next standalone tracing supplies the web runtime dependencies. The filtered
# production install supplies external worker and migrator dependencies.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=worker-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=worker-deps --chown=node:node /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /app/packages/db/migrations ./packages/db/migrations

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
