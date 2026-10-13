FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY . .
RUN npm install --global pnpm@10.34.7 && pnpm install --frozen-lockfile
CMD ["pnpm", "exec", "tsx", "scripts/linux-probe.ts"]
