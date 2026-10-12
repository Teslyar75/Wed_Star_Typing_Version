# Prod static build для Caddy (фаза 8)
# Контекст сборки — корень web_star_typing/ (нужен packages/themes).
FROM node:22-alpine AS build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /src/frontend
RUN npm ci
WORKDIR /src
COPY packages ./packages
COPY frontend ./frontend
WORKDIR /src/frontend
RUN npm run build

FROM alpine:3.20
WORKDIR /srv/frontend
COPY --from=build /src/frontend/dist .
CMD ["sleep", "infinity"]
