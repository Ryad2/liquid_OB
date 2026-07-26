FROM node:24.18.0-alpine

LABEL org.opencontainers.image.source="https://github.com/Ryad2/liquid_OB"

ENV NODE_ENV=production \
    LIQUIDITY_MCP_TRANSPORT=http \
    LIQUIDITY_MCP_HOST=0.0.0.0 \
    LIQUIDITY_MCP_PORT=3880

RUN corepack enable
WORKDIR /app
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile --prod=false && \
    pnpm --filter @liquid-ob/liquidity-mcp check && \
    pnpm store prune

USER node
EXPOSE 3880
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3880/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["./services/liquidity-mcp/node_modules/.bin/tsx", "services/liquidity-mcp/src/main.ts"]
