import test from 'node:test';
import assert from 'node:assert/strict';
import { signBody } from '../src/forwarding/signature.js';
import { AuthError, NonceCache, verifyTrackerRequest } from '../render-integration/tracker-auth.js';

const secret = '0123456789abcdef0123456789abcdef';
const timestamp = 1_700_000_000;
const nonce = 'fixed-nonce';
const rawBody = Buffer.from('{"ok":true}');

function headers(body = rawBody, signingSecret = secret) {
  return signBody(body, { secret: signingSecret, timestamp, nonce });
}

test('valid HMAC is accepted', () => {
  assert.equal(verifyTrackerRequest({ headers: headers(), rawBody }, { secret, nowSeconds: () => timestamp }), true);
});

test('wrong secret and manipulated body are rejected', () => {
  assert.throws(() => verifyTrackerRequest({ headers: headers(rawBody, 'wrong'), rawBody }, { secret, nowSeconds: () => timestamp }), AuthError);
  assert.throws(() => verifyTrackerRequest({ headers: headers(), rawBody: Buffer.from('{"ok":false}') }, { secret, nowSeconds: () => timestamp }), AuthError);
});

test('expired timestamp is rejected', () => {
  assert.throws(() => verifyTrackerRequest({ headers: headers(), rawBody }, { secret, nowSeconds: () => timestamp + 301 }), /outside/);
});

test('repeated nonce is rejected', () => {
  const nonceCache = new NonceCache({ now: () => timestamp * 1000 });
  verifyTrackerRequest({ headers: headers(), rawBody }, { secret, nonceCache, nowSeconds: () => timestamp });
  assert.throws(() => verifyTrackerRequest({ headers: headers(), rawBody }, { secret, nonceCache, nowSeconds: () => timestamp }), /already/);
});

