// Local proxy: strips headers that prevent whatslocal.ai from rendering
// inside the in-game vendor iframe. Requests to http://127.0.0.1:8788/*
// are forwarded to https://app.whatslocal.ai/*.
import http from 'http';
import https from 'https';
import { URL } from 'url';

const TARGET = 'https://app.whatslocal.ai';
const PORT = 8788;

const STRIP_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'x-content-type-options',
]);

function forward(req, res) {
  const target = new URL(TARGET);
  const options = {
    hostname: target.hostname,
    port: 443,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.hostname,
    },
  };

  const proxy = https.request(options, (upstream) => {
    const cleaned = {};
    for (const [k, v] of Object.entries(upstream.headers)) {
      if (!STRIP_HEADERS.has(k.toLowerCase())) {
        cleaned[k] = v;
      }
    }
    cleaned['access-control-allow-origin'] = '*';

    res.writeHead(upstream.statusCode, cleaned);
    upstream.pipe(res);
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502);
    res.end('Proxy error: ' + err.message);
  });

  req.pipe(proxy);
}

http.createServer(forward).listen(PORT, () => {
  console.log(`Proxy running -> http://localhost:${PORT} -> ${TARGET}`);
});
