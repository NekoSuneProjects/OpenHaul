FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace=@openhaul/web

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_MAP_ROAD_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
ARG NEXT_PUBLIC_MAP_SATELLITE_TILE_URL=https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MAP_ROAD_TILE_URL=$NEXT_PUBLIC_MAP_ROAD_TILE_URL
ENV NEXT_PUBLIC_MAP_SATELLITE_TILE_URL=$NEXT_PUBLIC_MAP_SATELLITE_TILE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY apps/web apps/web
RUN npm run build -w @openhaul/web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
