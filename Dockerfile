FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY server/package.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev
COPY server/index.mjs server/schema.sql ./
COPY --from=web /app/dist/mi-lista-de-regalos/browser /app/public
ENV STATIC_DIR=/app/public
ENV UPLOAD_DIR=/data/uploads
EXPOSE 8080
CMD ["node", "index.mjs"]
