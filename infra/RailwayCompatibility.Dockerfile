FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates bzip2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY config ./config
COPY infra/RailwayCompatibility.Dockerfile ./infra/RailwayCompatibility.Dockerfile
COPY docs/agave-compatibility-release.json ./docs/agave-compatibility-release.json
COPY docs/token-program-release.json ./docs/token-program-release.json
RUN mkdir -p evidence && npm install --global pnpm@10.34.7 && pnpm install --frozen-lockfile
RUN python3 scripts/install-agave.py --manifest docs/agave-compatibility-release.json --platform x86_64-unknown-linux-gnu --destination .tools/agave-linux-v3.0.14
RUN python3 scripts/install-token-program.py
ENV SC_HOSTING=railway SC_AGAVE_TAG=v3.0.14 SC_TOKEN_PROGRAM=10.0.0 SC_DATA_DIR=/data/app SC_NETWORK_CONFIG=/data/network.json RPC_UPSTREAM=http://127.0.0.1:8899 API_PORT=3000 RAYON_NUM_THREADS=4
EXPOSE 3000
CMD ["node", "--import", "tsx", "scripts/railway-start.ts"]
