import { createHmac } from 'node:crypto';
import { safeHexEqual, sha256Hex } from '../src/forwarding/signature.js';

export class AuthError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export class NonceCache {
  constructor({ ttlSeconds = 300, now = () => Date.now() } = {}) {
    this.ttlMs = ttlSeconds * 1000;
    this.now = now;
    this.entries = new Map();
  }
  consume(key) {
    const now = this.now();
    for (const [stored, expiresAt] of this.entries) if (expiresAt <= now) this.entries.delete(stored);
    if (this.entries.has(key)) return false;
    this.entries.set(key, now + this.ttlMs);
    return true;
  }
}

function header(headers, name) {
  if (typeof headers?.get === 'function') return headers.get(name);
  return headers?.[name.toLowerCase()] ?? headers?.[name];
}

export function verifyTrackerRequest({ headers, rawBody }, {
  secret, expectedKeyId = 'gateway-v1', maxSkewSeconds = 300,
  nonceCache = new NonceCache(), nowSeconds = () => Math.floor(Date.now() / 1000),
}) {
  if (!Buffer.isBuffer(rawBody)) throw new AuthError('INVALID_SIGNATURE', 'Raw request body is unavailable');
  const keyId = header(headers, 'x-tracker-key-id');
  const timestampText = header(headers, 'x-tracker-timestamp');
  const nonce = header(headers, 'x-tracker-nonce');
  const suppliedHash = header(headers, 'x-tracker-content-sha256');
  const signature = header(headers, 'x-tracker-signature');
  if (![keyId, timestampText, nonce, suppliedHash, signature].every((value) => typeof value === 'string' && value.length)) {
    throw new AuthError('INVALID_SIGNATURE', 'Required signature header is missing');
  }
  if (keyId !== expectedKeyId) throw new AuthError('INVALID_SIGNATURE', 'Unknown tracker key ID');
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds() - timestamp) > maxSkewSeconds) {
    throw new AuthError('EXPIRED_TIMESTAMP', 'Tracker timestamp is outside the allowed window');
  }
  const bodyHash = sha256Hex(rawBody);
  if (!safeHexEqual(bodyHash, suppliedHash)) throw new AuthError('INVALID_SIGNATURE', 'Body hash mismatch');
  if (!signature.startsWith('v1=')) throw new AuthError('INVALID_SIGNATURE', 'Unsupported signature version');
  const canonical = ['v1', timestampText, nonce, bodyHash].join('\n');
  const expectedMac = createHmac('sha256', secret).update(canonical).digest('hex');
  if (!safeHexEqual(expectedMac, signature.slice(3))) throw new AuthError('INVALID_SIGNATURE', 'HMAC mismatch');
  if (!nonceCache.consume(`${timestampText}:${nonce}`)) throw new AuthError('REPLAY_DETECTED', 'Nonce has already been used');
  return true;
}

