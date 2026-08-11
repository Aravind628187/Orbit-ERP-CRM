FROM node:24-alpine AS build

WORKDIR /app

# Keep the workspace layout intact so npm can use the root lockfile.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci

COPY server/tsconfig.json ./server/tsconfig.json
COPY server/src ./server/src
RUN npm run build -w server

FROM node:24-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Install only the API's production dependencies in the runtime image.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false \
    && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY server/src/db/schema.sql ./server/dist/db/schema.sql

EXPOSE 4000
USER node

# Migrations are idempotent and must complete before the API accepts traffic.
CMD ["sh", "-c", "node server/dist/db/migrate.js && exec node server/dist/server.js"]
