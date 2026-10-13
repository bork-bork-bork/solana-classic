FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
RUN npm install --global pnpm@10.34.7 && pnpm install --frozen-lockfile
COPY infra/image-assets ./infra/image-assets
RUN npm ci --prefix infra/image-assets
ENV SC_IMAGE_START=1
EXPOSE 8080
CMD ["node","--import","tsx","infra/image-assets/server.ts"]
