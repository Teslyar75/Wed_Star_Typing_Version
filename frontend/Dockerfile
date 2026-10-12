# Prod static build для Caddy (фаза 8)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM alpine:3.20
WORKDIR /srv/frontend
COPY --from=build /app/dist .
# артефакт читает Caddy volume/mount; образ сам по себе — только файлы
CMD ["sleep", "infinity"]
