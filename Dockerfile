FROM node:20.19-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-venv curl && \
    rm -rf /var/lib/apt/lists/*

# Pin BOTH mcp-proxy and the transitive mcp package. mcp-proxy 0.12.0 declares
# mcp>=1.17.0 with no upper bound, so an unpinned build resolves mcp 2.x, which
# removed request_ctx -> ImportError at boot. mcp<2 keeps it on the 1.x line.
RUN python3 -m venv /opt/mcpproxy && \
    /opt/mcpproxy/bin/pip install --no-cache-dir "mcp-proxy==0.12.0" "mcp<2"
ENV PATH="/opt/mcpproxy/bin:${PATH}"

WORKDIR /app
COPY . .
RUN npm ci --ignore-scripts && npm run build

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

CMD ["node", "proxy.mjs"]
