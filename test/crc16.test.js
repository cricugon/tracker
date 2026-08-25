import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16Ibm } from '../src/teltonika/crc16.js';
import { makeCodec8eData, makeCodec8eFrame } from './helpers/fixture.js';
import { parseAvlFrame } from '../src/teltonika/packet.js';

test('CRC-16/IBM standard check value', () => {
  assert.equal(crc16Ibm(Buffer.from('123456789')), 0xbb3d);
});

test('valid frame CRC is accepted', () => assert.equal(parseAvlFrame(makeCodec8eFrame()).recordCount, 1));

test('invalid frame CRC is rejected', () => {
  const frame = makeCodec8eFrame();
  frame[frame.length - 1] ^= 1;
  assert.throws(() => parseAvlFrame(frame), { code: 'invalid_crc' });
});

test('encoded frame stores CRC over data field', () => {
  const data = makeCodec8eData();
  const frame = makeCodec8eFrame();
  assert.equal(frame.readUInt32BE(frame.length - 4), crc16Ibm(data));
});

