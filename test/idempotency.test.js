import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAvlFrame } from '../src/teltonika/packet.js';
import { buildPayload } from '../src/forwarding/payload.js';
import { makeCodec8eFrame } from './helpers/fixture.js';

test('same packet produces identical packetId and eventId', () => {
  const frame = makeCodec8eFrame();
  const first = buildPayload({ imei: '356000000000001', model: 'FMC880', parsedPacket: parseAvlFrame(frame) });
  const second = buildPayload({ imei: '356000000000001', model: 'FMC880', parsedPacket: parseAvlFrame(Buffer.from(frame)) });
  assert.equal(first.packet.packetId, second.packet.packetId);
  assert.equal(first.records[0].eventId, second.records[0].eventId);
  assert.equal(first.device.model, 'FMC880');
});
