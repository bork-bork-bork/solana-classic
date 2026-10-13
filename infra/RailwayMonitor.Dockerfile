FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df
WORKDIR /app
COPY scripts/monitor.ts ./scripts/monitor.ts
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "--expose-gc", "scripts/monitor.ts"]
