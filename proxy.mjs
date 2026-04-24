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
  'supergateway',
  [
    '--stdio', 'node dist/index.js',
    '--port', String(INTERNAL_PORT),
    '--baseUrl', PUBLIC_URL,
    '--cors',
  ],
  { stdio: 'inherit', shell: true, env: process.env }
);

gw.on('exit', (code) => {
  console.error(`supergateway exited with code ${code}`);
  process.exit(1);
});

await new Promise((r) => setTimeout(r, 2000));

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

  const options = {
    hostname: '127.0.0.1',
    port: INTERNAL_PORT,
    path: url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${INTERNAL_PORT}` },
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad gateway');
    } else {
      res.destroy();
    }
  });

  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Auth proxy on 0.0.0.0:${PORT} -> supergateway on ${INTERNAL_PORT} (public: ${PUBLIC_URL})`
  );
});
