FROM node:24.18.0-alpine AS build

RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ARG VITE_PROTOCOL_MODE=live
ARG VITE_CHAIN_ID
ARG VITE_PUBLIC_RPC_URL
ARG VITE_DEPLOYMENT_MANIFEST_URL
ARG VITE_SOLVER_URL
ENV VITE_PROTOCOL_MODE=${VITE_PROTOCOL_MODE} \
    VITE_CHAIN_ID=${VITE_CHAIN_ID} \
    VITE_PUBLIC_RPC_URL=${VITE_PUBLIC_RPC_URL} \
    VITE_DEPLOYMENT_MANIFEST_URL=${VITE_DEPLOYMENT_MANIFEST_URL} \
    VITE_SOLVER_URL=${VITE_SOLVER_URL}
RUN if [ "$VITE_PROTOCOL_MODE" = "live" ]; then \
      test -n "$VITE_CHAIN_ID" && \
      test -n "$VITE_PUBLIC_RPC_URL" && \
      test -n "$VITE_DEPLOYMENT_MANIFEST_URL" && \
      test -n "$VITE_SOLVER_URL"; \
    fi && pnpm --filter @liquid-ob/web build

FROM node:24.18.0-alpine
LABEL org.opencontainers.image.source="https://github.com/Ryad2/liquid_OB"
ENV NODE_ENV=production WEB_HOST=0.0.0.0 WEB_PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/dist ./dist
COPY --chown=node:node apps/web/server.mjs ./server.mjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
