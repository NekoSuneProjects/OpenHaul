FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace=@openhaul/api --workspace=@openhaul/web

FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_MAP_ROAD_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
ARG NEXT_PUBLIC_MAP_SATELLITE_TILE_URL=https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MAP_ROAD_TILE_URL=$NEXT_PUBLIC_MAP_ROAD_TILE_URL
ENV NEXT_PUBLIC_MAP_SATELLITE_TILE_URL=$NEXT_PUBLIC_MAP_SATELLITE_TILE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/api apps/api
COPY apps/web apps/web

RUN npm run build -w @openhaul/api
RUN npm run build -w @openhaul/web

FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache nginx ffmpeg

ENV NODE_ENV=production
ENV API_PORT=3001

# Runtime dependencies are hoisted by npm workspaces.
COPY --from=deps /app/node_modules ./node_modules

# Fastify API.
COPY --from=build /app/apps/api/dist ./apps/api/dist

# Next.js standalone web runtime.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./.next/static
COPY --from=build /app/apps/web/public ./public

# Single-origin gateway and process launcher.
COPY infra/nginx/openhaul-container.conf /etc/nginx/nginx.conf
COPY infra/docker/openhaul-entrypoint.sh /usr/local/bin/openhaul-entrypoint
RUN chmod +x /usr/local/bin/openhaul-entrypoint

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/openhaul-entrypoint"]
