import net from 'node:net';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTcpServer } from '../src/tcp/server.js';
import { createMetrics } from '../src/metrics.js';
import { encodeImeiHandshake } from '../src/teltonika/imei.js';
import { makeCodec8eFrame } from './helpers/fixture.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };
const baseConfig = { maxAvlDataLength: 4096, tcpIdleTimeoutMs: 5000, allowedImeis: new Set(), logRawPackets: false };

async function exchange(renderClient, { bytewise = false } = {}) {
  const metrics = createMetrics();
  const { server } = createTcpServer({ config: baseConfig, logger: silentLogger, metrics, renderClient });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const socket = net.createConnection({ port: server.address().port, host: '127.0.0.1' });
  await once(socket, 'connect');
  const replies = [];
  socket.on('data', (data) => replies.push(...data));
  const input = Buffer.concat([encodeImeiHandshake('356000000000001'), makeCodec8eFrame()]);
  if (bytewise) for (const byte of input) socket.write(Buffer.from([byte]));
  else socket.write(input);
  const deadline = Date.now() + 2000;
  while (replies.length < 5 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  socket.destroy();
  await new Promise((resolve) => server.close(resolve));
  return { reply: Buffer.from(replies), metrics };
}

test('Render acceptance produces ACK N even for bytewise TCP input', async () => {
  const { reply, metrics } = await exchange({ forward: async () => ({ ok: true, accepted: 1 }) }, { bytewise: true });
  assert.equal(reply.subarray(0, 1).toString('hex'), '01');
  assert.equal(reply.subarray(1, 5).readUInt32BE(), 1);
  assert.equal(metrics.packetsForwarded, 1);
});

test('Render failure never produces a positive ACK', async () => {
  const { reply, metrics } = await exchange({ forward: async () => { throw new Error('down'); } });
  assert.equal(reply.subarray(0, 1).toString('hex'), '01');
  assert.equal(reply.subarray(1, 5).readUInt32BE(), 0);
  assert.equal(metrics.packetsForwarded, 0);
  assert.equal(metrics.renderErrors, 1);
});

