FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates bzip2 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm install --global pnpm@10.34.7 && pnpm install --frozen-lockfile
COPY scripts ./scripts
COPY config ./config
COPY docs ./docs
COPY infra ./infra
COPY engine ./engine
COPY source-binaries.tar.gz ./source-binaries.tar.gz
RUN mkdir -p evidence .tools/agave-linux-v3.0.14/solana-release/bin && tar -xzf source-binaries.tar.gz -C .tools/agave-linux-v3.0.14/solana-release/bin && rm source-binaries.tar.gz && python3 scripts/install-token-program.py
ENV SC_HOSTING=railway SC_AGAVE_TAG=v3.0.14 SC_TOKEN_PROGRAM=10.0.0 SC_DATA_DIR=/data/app SC_NETWORK_CONFIG=/data/network.json RPC_UPSTREAM=http://127.0.0.1:8899 API_PORT=3000 RAYON_NUM_THREADS=4 SC_MIGRATION_MODE=image-probe
EXPOSE 3000
CMD ["node", "--import", "tsx", "engine/migration/start.mjs"]
