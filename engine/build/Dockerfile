FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS node
FROM rust:1.86.0-bookworm@sha256:878ca0e8df1305dcbbfffac5bb908cce6a4bc5f6b629c518e7112645ee8851d4
RUN apt-get update && apt-get install -y --no-install-recommends python3 cmake clang llvm libclang-dev pkg-config libssl-dev libudev-dev protobuf-compiler libprotobuf-dev zlib1g-dev libbz2-dev liblz4-dev uuid-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local /opt/node
ENV PATH=/opt/node/bin:/usr/local/cargo/bin:/usr/local/bin:/usr/bin:/bin
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm install --global pnpm@10.34.7 && pnpm install --frozen-lockfile && test "$(node --version)" = v24.19.0 && test "$(rustc --version | cut -d ' ' -f2)" = 1.86.0
COPY source.tar ./source.tar
RUN mkdir source && tar -xf source.tar -C source && rm source.tar
COPY build ./build
COPY source-manifest.json token-program-release.json ./
ENV CARGO_HOME=/data/cargo CARGO_TARGET_DIR=/data/target CARGO_BUILD_JOBS=2 CARGO_PROFILE_RELEASE_DEBUG=0 AGAVE_GIT_COMMIT_HASH=f516a8927c76c07f0ebc54ca7a4ce8b2046eee86 RAYON_NUM_THREADS=2
EXPOSE 3000
CMD ["python3", "-u", "/app/build/worker.py"]
