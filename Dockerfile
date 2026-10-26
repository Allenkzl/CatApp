FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production CAT_MODE=server CAT_REQUIRE_LOGIN=false HOST=0.0.0.0 PORT=4173 CAT_DATA_DIR=/app/data
COPY --chown=node:node package.json index.html ./
COPY --chown=node:node src/ ./src/
COPY --chown=node:node public/ ./public/
COPY --chown=node:node server/ ./server/
COPY --chown=node:node scripts/serve.mjs ./scripts/serve.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/serve.mjs"]
