FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY public/ ./public/
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts ./

EXPOSE 3000
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/server.js"]
