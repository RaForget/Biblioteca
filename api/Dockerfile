FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
COPY tests/ tests/
RUN npm run build && npm test

FROM build AS development
USER root
RUN chown -R node:node /app
ENV NODE_ENV=development API_HOST=0.0.0.0 API_PORT=3001
USER node
EXPOSE 3001
CMD ["npm", "run", "dev"]

FROM node:24-bookworm-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
