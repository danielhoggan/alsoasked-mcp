FROM node:20-slim

WORKDIR /app

COPY . .

RUN npm ci --ignore-scripts
RUN npm run build
RUN npm install -g mcp-proxy

EXPOSE 8000

CMD ["sh", "-c", "mcp-proxy --port ${PORT:-8000} --apiKey ${PROXY_API_KEY} -- node dist/index.js"]
