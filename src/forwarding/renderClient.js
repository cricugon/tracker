import { setTimeout as delay } from 'node:timers/promises';
import { signBody } from './signature.js';

export class RenderForwardError extends Error {
  constructor(message, options) { super(message, options); this.name = 'RenderForwardError'; }
}

export function createRenderClient(config, { fetchImpl = globalThis.fetch, logger } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  async function attempt(payload) {
    const rawBody = JSON.stringify(payload);
    const headers = signBody(rawBody, { secret: config.sharedSecret, keyId: config.trackerKeyId });
    const response = await fetchImpl(config.renderUrl, {
      method: 'POST', headers, body: rawBody, signal: AbortSignal.timeout(config.renderTimeoutMs),
    });
    let body;
    try { body = await response.json(); } catch { throw new RenderForwardError(`Render returned non-JSON HTTP ${response.status}`); }
    if (!response.ok) throw new RenderForwardError(`Render returned HTTP ${response.status} (${body?.code || 'unknown'})`);
    if (body?.ok !== true || !Number.isInteger(body.accepted) || body.accepted !== payload.records.length) {
      throw new RenderForwardError('Render response did not confirm every record');
    }
    return body;
  }

  return {
    async forward(payload) {
      let lastError;
      for (let attemptNumber = 0; attemptNumber <= config.renderMaxRetries; attemptNumber += 1) {
        try { return await attempt(payload); } catch (error) {
          lastError = error;
          logger?.warn('render_forward_failed', { attempt: attemptNumber + 1, error: error.message });
          if (attemptNumber < config.renderMaxRetries) await delay(100 * (2 ** attemptNumber));
        }
      }
      throw new RenderForwardError('Render forwarding exhausted retries', { cause: lastError });
    },
  };
}

