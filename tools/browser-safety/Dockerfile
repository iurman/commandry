FROM node:24.22.2-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    XDG_CONFIG_HOME=/tmp/config \
    XDG_CACHE_HOME=/tmp/cache
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates chromium chromium-sandbox fonts-liberation fonts-noto-color-emoji \
    && mkdir -p /opt/google/chrome \
    && ln -s /usr/bin/chromium /opt/google/chrome/chrome \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/browser
ARG PLAYWRIGHT_VERSION
RUN npm init -y \
    && npm install --omit=dev --save-exact --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}" \
    && npm cache clean --force
COPY browser-safety.cjs server.mjs ./
USER node
RUN node --input-type=module -e 'import { chromium } from "playwright"; import { chromiumLaunchOptions } from "./browser-safety.cjs"; chromiumLaunchOptions(chromium);'
CMD ["node", "server.mjs"]
