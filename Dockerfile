# syntax=docker/dockerfile:1.7

FROM node:24.20.0-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0 AS dependency-cache
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
# Deploy into a fresh directory so fetched development and optional peer
# packages are not copied into the runtime image.
RUN CI=true pnpm --filter @commandry/worker deploy --legacy --prod --no-optional --frozen-lockfile /runtime

FROM node:24.20.0-trixie-slim@sha256:50c3b2f6988dfc307b86e5301d69611af31f4789bdf232863b07d3b02fe55ae0 AS runtime
WORKDIR /app
RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /opt/yarn-v1.22.22; \
    rm /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
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
COPY --from=worker-deps --chown=node:node /runtime/node_modules ./apps/worker/node_modules
COPY --from=build --chown=node:node /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=node:node /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=node:node /app/packages/db/migrations ./packages/db/migrations

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
