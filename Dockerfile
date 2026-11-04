# ---- build the web app
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY web ./web
RUN NEXT_TELEMETRY_DISABLED=1 npx next build web && rm -rf web/.next/cache

# ---- runtime: production dependencies, the API and the built web app
FROM node:22-slim
WORKDIR /app
# pdftotext (poppler) reads uploaded PDF resumes
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY *.js ./
COPY lib ./lib
COPY db ./db
COPY services ./services
COPY routes ./routes
COPY dograh ./dograh
COPY demo ./demo
COPY scripts ./scripts
COPY --from=build /app/web/.next ./web/.next
COPY web/next.config.mjs web/package.json* ./web/
COPY web/public ./web/public
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=4870 DB_PATH=/data/recruiting.db LOG_FORMAT=json
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4870
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:4870/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-sqlite", "--no-warnings", "server.js"]
