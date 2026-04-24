import { createServer, request as httpRequest } from 'http';
import { spawn } from 'child_process';

const PORT = parseInt(process.env.PORT || '8000', 10);
const INTERNAL_PORT = 8001;
const API_KEY = process.env.PROXY_API_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null);

if (!API_KEY) {
  console.error('PROXY_API_KEY env var is required');
  process.exit(1);
}
if (!PUBLIC_URL) {
  console.error('PUBLIC_URL or RAILWAY_PUBLIC_DOMAIN must be set');
  process.exit(1);
}

const gw = spawn(
  'mcp-proxy',
  [
    '--port', String(INTERNAL_PORT),
    '--host', '127.0.0.1',
    '--pass-environment',
    '--allow-origin', '*',
    '--',
    'node', 'dist/index.js',
  ],
  { stdio: 'inherit', env: process.env }
);

gw.on('exit', (code) => {
  console.error(`supergateway exited with code ${code}`);
  process.exit(1);
});

await new Promise((r) => setTimeout(r, 2000));

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function sanitizeHeaders(incoming) {
  const result = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (key.startsWith(':')) continue;
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (value === undefined || value === null) continue;
    result[key] = value;
  }
  result.host = `127.0.0.1:${INTERNAL_PORT}`;
  return result;
}

function isAuthorized(req) {
  const xKey = req.headers['x-api-key'];
  const auth = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return xKey === API_KEY || bearer === API_KEY;
}

const server = createServer((req, res) => {
  const url = req.url || '/';
  console.log(
    `${req.method} ${url} bearer=${!!req.headers.authorization} xkey=${!!req.headers['x-api-key']}`
  );

  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  const isMessage = url.startsWith('/message?');

  if (!isMessage && !isAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  let proxyReq;
  try {
    proxyReq = httpRequest({
      hostname: '127.0.0.1',
      port: INTERNAL_PORT,
      path: url,
      method: req.method,
      headers: sanitizeHeaders(req.headers),
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
  } catch (err) {
    console.error(`httpRequest threw synchronously on ${req.method} ${url}:`, err.code, err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad gateway (sync)');
    return;
  }

  proxyReq.on('error', (err) => {
    console.error(`Proxy error on ${req.method} ${url}:`, err.code, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad gateway');
    } else {
      res.destroy();
    }
  });

  req.on('aborted', () => proxyReq.destroy());
  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Auth proxy on 0.0.0.0:${PORT} -> supergateway on ${INTERNAL_PORT} (public: ${PUBLIC_URL})`
  );
});
