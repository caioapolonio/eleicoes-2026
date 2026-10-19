# syntax=docker/dockerfile:1

# ---------- build: type-check and render the static site ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run astro check && bun run build

# ---------- serve: plain nginx with the built files ----------
FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
