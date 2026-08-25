import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function signBody(rawBody, { secret, keyId = 'gateway-v1', timestamp = Math.floor(Date.now() / 1000), nonce = randomUUID() }) {
  if (!secret) throw new Error('HMAC secret is required');
  const bodyHash = sha256Hex(rawBody);
  const canonical = ['v1', String(timestamp), nonce, bodyHash].join('\n');
  const mac = createHmac('sha256', secret).update(canonical).digest('hex');
  return {
    'content-type': 'application/json',
    'x-tracker-key-id': keyId,
    'x-tracker-timestamp': String(timestamp),
    'x-tracker-nonce': nonce,
    'x-tracker-content-sha256': bodyHash,
    'x-tracker-signature': `v1=${mac}`,
  };
}

export function safeHexEqual(left, right) {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right) || left.length !== right.length || left.length % 2) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
