import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeImeiHandshake, validateImei } from '../src/teltonika/imei.js';
import { TeltonikaFrameBuffer } from '../src/tcp/frameBuffer.js';

const IMEI = '356000000000001';

test('complete IMEI handshake', () => {
  const parser = new TeltonikaFrameBuffer();
  parser.push(encodeImeiHandshake(IMEI));
  assert.equal(parser.takeImei(), IMEI);
});

test('fragmented IMEI handshake waits for all bytes', () => {
  const encoded = encodeImeiHandshake(IMEI);
  const parser = new TeltonikaFrameBuffer();
  for (let index = 0; index < encoded.length - 1; index += 1) {
    parser.push(encoded.subarray(index, index + 1));
    assert.equal(parser.takeImei(), null);
  }
  parser.push(encoded.subarray(-1));
  assert.equal(parser.takeImei(), IMEI);
});

test('invalid IMEIs are rejected syntactically', () => {
  assert.equal(validateImei('abc'), false);
  assert.equal(validateImei('1234567890123'), false);
  assert.equal(validateImei('356000000000001'), true);
});

test('allowlist membership can reject an otherwise valid IMEI', () => {
  const allowed = new Set(['356000000000002']);
  assert.equal(validateImei(IMEI) && allowed.has(IMEI), false);
});

