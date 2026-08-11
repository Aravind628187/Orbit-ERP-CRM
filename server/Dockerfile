FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/src ./server/src
RUN npm run build -w server

FROM node:24-alpine AS production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY server/src/db/schema.sql ./server/dist/db/schema.sql
ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["node", "server/dist/server.js"]
