FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY config ./config
COPY infra ./infra
COPY docs/dependency-manifest.json docs/sprint-clock.json ./docs/
COPY docs/planning ./docs/planning
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.tools/playwright-browsers
RUN npm install --global pnpm@10.34.7 && pnpm install --frozen-lockfile && \
    test "$(node --version)" = v24.19.0 && test "$(pnpm --version)" = 10.34.7 && \
    node -e "if(require('@playwright/test/package.json').version !== '1.64.0') process.exit(1)" && \
    pnpm exec playwright install --with-deps chromium && \
    mkdir -p /app/evidence /app/.data && chmod 700 /app/.data
# The dedicated QA volume is /data. No runtime ledger or key enters this image.
ENV PORT=3000 SC_API_URL=https://network-release-production.up.railway.app SC_NETWORK_CONFIG=config/network.remote.json SC_SOAK_FUNDER_FILE=.data/soak-funder.json
EXPOSE 3000
CMD ["node", "--import", "tsx", "scripts/hosted-soak-start.ts"]
