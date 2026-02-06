FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build && npm run build:mcp

FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps --ignore-scripts

COPY --from=builder /app/dist ./dist

EXPOSE 3000 3002

CMD ["node", "dist/main"]
