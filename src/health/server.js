import http from 'node:http';

export function createHealthServer(metrics) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'NOT_FOUND' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      service: 'teltonika-ftc887-gateway',
      uptimeSeconds: Math.floor(process.uptime()),
      activeConnections: metrics.activeConnections,
      lastRenderSuccessAt: metrics.lastRenderSuccessAt,
      stats: {
        connectionsTotal: metrics.connectionsTotal, imeiRejected: metrics.imeiRejected,
        packetsReceived: metrics.packetsReceived, recordsReceived: metrics.recordsReceived,
        packetsForwarded: metrics.packetsForwarded, recordsForwarded: metrics.recordsForwarded,
        packetsRejected: metrics.packetsRejected, renderErrors: metrics.renderErrors, crcErrors: metrics.crcErrors,
      },
    }));
  });
}

