FROM node:22-slim
WORKDIR /app
# pdftotext (poppler) reads uploaded PDF resumes
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY *.js ./
COPY lib ./lib
COPY db ./db
COPY services ./services
COPY routes ./routes
COPY public ./public
COPY dograh ./dograh
COPY demo ./demo
COPY scripts ./scripts
ENV NODE_ENV=production PORT=4870 DB_PATH=/data/recruiting.db LOG_FORMAT=json
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4870
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4870/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-sqlite", "--no-warnings", "server.js"]
