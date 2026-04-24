import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
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

const app = express();

app.use((req, _res, next) => {
  console.log(
    `${req.method} ${req.url} bearer=${!!req.headers.authorization} xkey=${!!req.headers['x-api-key']}`
  );
  next();
});

app.get('/healthz', (_req, res) => res.send('ok'));

app.use((req, res, next) => {
  const xKey = req.headers['x-api-key'];
  const auth = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (xKey === API_KEY || bearer === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

app.use(
  '/',
  createProxyMiddleware({
    target: `http://127.0.0.1:${INTERNAL_PORT}`,
    changeOrigin: true,
    ws: true,
  })
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Auth proxy on 0.0.0.0:${PORT} -> supergateway on ${INTERNAL_PORT} (public: ${PUBLIC_URL})`);
});
