import { loadConfig } from './config.js';
import { createLogger } from './utils/logger.js';
import { createMetrics } from './metrics.js';
import { createRenderClient } from './forwarding/renderClient.js';
import { createTcpServer } from './tcp/server.js';
import { createHealthServer } from './health/server.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, fullImei: config.logFullImei });
const metrics = createMetrics();
if (config.allowedImeis.size === 0) logger.warn('allowed_imeis_empty', { message: 'WARNING: ALLOWED_IMEIS is empty' });
const renderClient = createRenderClient(config, { logger });
const { server: tcpServer, sockets } = createTcpServer({ config, logger, metrics, renderClient });
const healthServer = createHealthServer(metrics);

tcpServer.listen(config.tcpPort, '0.0.0.0', () => logger.info('server_started', { protocol: 'tcp', host: '0.0.0.0', port: config.tcpPort }));
healthServer.listen(config.healthPort, '0.0.0.0', () => logger.info('server_started', { protocol: 'http', host: '0.0.0.0', port: config.healthPort }));

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('shutdown_started', { signal });
  for (const socket of sockets) socket.end();
  const forceTimer = setTimeout(() => {
    for (const socket of sockets) socket.destroy();
    process.exit(0);
  }, 5000);
  forceTimer.unref();
  const close = (server) => new Promise((resolve) => {
    if (!server.listening) resolve();
    else server.close(() => resolve());
  });
  Promise.all([close(tcpServer), close(healthServer)]).then(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
