# syntax=docker/dockerfile:1.7

# ---- deps: install all dependencies (incl. dev) for building --------------
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---- build: compile TypeScript and generate the Prisma client --------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---- prod-deps: production node_modules only --------------------------------
FROM deps AS prod-deps
RUN npm prune --omit=dev && npx prisma generate

# ---- production: minimal, non-root runtime ----------------------------------
FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl dumb-init \
  && addgroup -S app && adduser -S app -G app

COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --chown=app:app package.json ./
COPY --chown=app:app prisma ./prisma

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# dumb-init forwards SIGTERM so the app's graceful shutdown runs.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
