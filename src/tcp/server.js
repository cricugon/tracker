import net from 'node:net';
import { handleConnection } from './connection.js';

export function createTcpServer(dependencies) {
  const activeDevices = dependencies.activeDevices || new Map();
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    handleConnection(socket, { ...dependencies, activeDevices });
  });
  server.on('error', (error) => dependencies.logger.error('tcp_server_error', { error: error.message }));
  return { server, activeDevices, sockets };
}
