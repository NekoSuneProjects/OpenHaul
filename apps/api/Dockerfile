FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace=@openhaul/api
COPY apps/api apps/api
RUN npm run build -w @openhaul/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --omit=dev --workspace=@openhaul/api
COPY --from=build /app/apps/api/dist apps/api/dist
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@openhaul/api"]
