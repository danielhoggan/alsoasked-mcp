FROM node:20-slim

WORKDIR /app

COPY . .

RUN npm ci --ignore-scripts
RUN npm run build
RUN npm install -g supergateway
RUN npm install express@^4 http-proxy-middleware@^3

EXPOSE 8000

CMD ["node", "proxy.mjs"]
