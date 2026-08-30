# Production image for a Node host (Render, Fly, Railway, any Docker runner).
# Vercel builds from the repo directly and does not use this file.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV BUILD_STANDALONE=1
RUN npm run build \
  && cp -r public .next/standalone/public \
  && cp -r .next/static .next/standalone/.next/static \
  && mkdir -p .next/standalone/data \
  && cp data/live-tape.json .next/standalone/data/live-tape.json

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=43173
EXPOSE 43173

WORKDIR /app/.next/standalone
CMD ["node", "server.js"]
