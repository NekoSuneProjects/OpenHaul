FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/bot/package.json apps/bot/package.json
RUN npm install --workspace=@openhaul/bot
COPY apps/bot apps/bot
RUN npm run build -w @openhaul/bot

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY apps/bot/package.json apps/bot/package.json
RUN npm install --omit=dev --workspace=@openhaul/bot
COPY --from=build /app/apps/bot/dist apps/bot/dist
CMD ["npm", "run", "start", "-w", "@openhaul/bot"]
