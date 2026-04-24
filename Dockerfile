FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip pipx && \
    rm -rf /var/lib/apt/lists/*

RUN pipx install mcp-proxy
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

COPY . .

RUN npm ci --ignore-scripts
RUN npm run build

EXPOSE 8000

CMD ["node", "proxy.mjs"]
