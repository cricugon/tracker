import http from 'node:http';
import { NonceCache, verifyTrackerRequest } from '../render-integration/tracker-auth.js';

const port = Number(process.env.MOCK_RENDER_PORT || 3001);
const secret = process.env.TRACKER_SHARED_SECRET;
if (!secret) throw new Error('TRACKER_SHARED_SECRET is required for the mock');
const keyId = process.env.TRACKER_KEY_ID || 'gateway-v1';
const nonceCache = new NonceCache();

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/tracker') {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end('{"ok":false,"code":"NOT_FOUND"}');
  }
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 262144) req.destroy();
    else chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const rawBody = Buffer.concat(chunks);
      verifyTrackerRequest({ headers: req.headers, rawBody }, { secret, expectedKeyId: keyId, nonceCache });
      const payload = JSON.parse(rawBody.toString('utf8'));
      const accepted = Array.isArray(payload.records) ? payload.records.length : -1;
      if (accepted < 0 || payload.packet?.recordCount !== accepted) throw new Error('Invalid payload');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, accepted }));
    } catch (error) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'INVALID_REQUEST' }));
    }
  });
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`Mock Render listening on http://127.0.0.1:${port}/tracker\n`));
