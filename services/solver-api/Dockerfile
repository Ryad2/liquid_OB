FROM node:24.18.0-alpine

LABEL org.opencontainers.image.source="https://github.com/Ryad2/liquid_OB"

ENV NODE_ENV=production \
    SOLVER_API_HOST=0.0.0.0 \
    SOLVER_API_PORT=3878

RUN corepack enable
WORKDIR /app
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile --prod=false && \
    pnpm --filter @liquid-ob/solver-api check && \
    pnpm store prune

USER node
EXPOSE 3878
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3878/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["./services/solver-api/node_modules/.bin/tsx", "services/solver-api/src/main.ts"]
