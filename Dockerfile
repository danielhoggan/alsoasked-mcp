FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npm install -g supergateway

EXPOSE 8000

CMD sh -c 'supergateway --stdio "node dist/index.js" --port ${PORT:-8000} --baseUrl https://${RAILWAY_PUBLIC_DOMAIN}'
