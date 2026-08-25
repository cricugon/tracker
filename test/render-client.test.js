import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderClient, RenderForwardError } from '../src/forwarding/renderClient.js';

const config = {
  sharedSecret: '0123456789abcdef0123456789abcdef', trackerKeyId: 'gateway-v1',
  renderUrl: 'https://example.test/tracker', renderTimeoutMs: 1000, renderMaxRetries: 0,
};
const payload = { records: [{ eventId: 'x' }] };

test('accepts only a complete Render confirmation', async () => {
  const client = createRenderClient(config, { fetchImpl: async (_url, request) => {
    assert.match(request.headers['x-tracker-signature'], /^v1=[0-9a-f]{64}$/);
    return new Response(JSON.stringify({ ok: true, accepted: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  assert.deepEqual(await client.forward(payload), { ok: true, accepted: 1 });
});

test('rejects HTTP failure or incomplete accepted count', async () => {
  const httpFailure = createRenderClient(config, { fetchImpl: async () => new Response('{"ok":false}', { status: 500 }) });
  await assert.rejects(() => httpFailure.forward(payload), RenderForwardError);
  const partial = createRenderClient(config, { fetchImpl: async () => new Response('{"ok":true,"accepted":0}', { status: 200 }) });
  await assert.rejects(() => partial.forward(payload), RenderForwardError);
});
