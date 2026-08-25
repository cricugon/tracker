import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackerHandler } from '../render-integration/tracker-handler.js';
import { signBody } from '../src/forwarding/signature.js';
import { buildPayload } from '../src/forwarding/payload.js';
import { parseAvlFrame } from '../src/teltonika/packet.js';
import { makeCodec8eFrame } from './helpers/fixture.js';

const secret = '0123456789abcdef0123456789abcdef';

function responseCapture() {
  return {
    statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request(payload, options = {}) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return { body: payload, rawBody, headers: signBody(rawBody, { secret, ...options }) };
}

function payload() {
  return buildPayload({ imei: '356000000000001', parsedPacket: parseAvlFrame(makeCodec8eFrame()) });
}

test('handler persists transactionally and accepts duplicates through upsert semantics', async () => {
  const events = new Set();
  const repository = {
    findTrackerByImei: async () => ({ id: 7, enabled: true, iccid: '89450012345678901234' }),
    transaction: async (work) => work({}),
    upsertPosition: async ({ record }) => events.add(record.eventId),
  };
  const handler = createTrackerHandler({ repository, secret });
  const first = responseCapture();
  await handler(request(payload()), first);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.body, { ok: true, accepted: 1 });
  // A retransmission has a fresh signed nonce but the same eventId.
  const second = responseCapture();
  await handler(request(payload()), second);
  assert.equal(second.statusCode, 200);
  assert.equal(events.size, 1);
});

test('unknown device is rejected after successful authentication', async () => {
  const repository = { findTrackerByImei: async () => null };
  const handler = createTrackerHandler({ repository, secret });
  const res = responseCapture();
  await handler(request(payload()), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'UNKNOWN_DEVICE');
});
