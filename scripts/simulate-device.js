import net from 'node:net';
import { encodeImeiHandshake } from '../src/teltonika/imei.js';
import { makeCodec8eFrame } from '../test/helpers/fixture.js';

const host = process.env.SIMULATOR_HOST || '127.0.0.1';
const port = Number(process.env.SIMULATOR_PORT || process.env.TCP_PORT || 5000);
const imei = process.env.SIMULATOR_IMEI || '356000000000001';
const socket = net.createConnection({ host, port });
let state = 'handshake';
let response = Buffer.alloc(0);

socket.setTimeout(10000);
socket.on('connect', () => {
  process.stdout.write(`Connected to ${host}:${port}; sending IMEI ${imei}\n`);
  socket.write(encodeImeiHandshake(imei));
});
socket.on('data', (chunk) => {
  response = Buffer.concat([response, chunk]);
  if (state === 'handshake' && response.length >= 1) {
    const accepted = response[0] === 1;
    response = response.subarray(1);
    process.stdout.write(`IMEI response: 0x${accepted ? '01 accepted' : '00 rejected'}\n`);
    if (!accepted) return socket.end();
    state = 'avl';
    socket.write(makeCodec8eFrame());
  }
  if (state === 'avl' && response.length >= 4) {
    process.stdout.write(`AVL ACK: ${response.readUInt32BE(0)} record(s)\n`);
    socket.end();
  }
});
socket.on('timeout', () => { process.stderr.write('Simulator timed out\n'); socket.destroy(); process.exitCode = 1; });
socket.on('error', (error) => { process.stderr.write(`Simulator error: ${error.message}\n`); process.exitCode = 1; });

