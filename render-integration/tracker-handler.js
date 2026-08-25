import { AuthError, NonceCache, verifyTrackerRequest } from './tracker-auth.js';
import { PayloadError, validateTrackerPayload } from './payload-validation.js';

export const rawJsonOptions = {
  verify(req, _res, buffer) { req.rawBody = Buffer.from(buffer); },
  limit: '256kb',
};

export function createTrackerHandler({
  repository, secret, keyId = 'gateway-v1', logger = console,
  nonceCache = new NonceCache(), rejectIccidMismatch = true,
}) {
  if (!repository || !secret) throw new TypeError('repository and secret are required');
  return async function trackerHandler(req, res) {
    try {
      verifyTrackerRequest({ headers: req.headers, rawBody: req.rawBody }, { secret, expectedKeyId: keyId, nonceCache });
      const payload = validateTrackerPayload(req.body);
      const tracker = await repository.findTrackerByImei(payload.device.imei);
      if (!tracker || tracker.enabled === false) return res.status(403).json({ ok: false, code: 'UNKNOWN_DEVICE' });
      if (payload.device.iccid && tracker.iccid && payload.device.iccid !== tracker.iccid) {
        logger.warn?.('tracker_iccid_mismatch', { trackerId: tracker.id });
        if (rejectIccidMismatch) return res.status(403).json({ ok: false, code: 'ICCID_MISMATCH' });
      }
      await repository.transaction(async (transaction) => {
        for (const record of payload.records) {
          await repository.upsertPosition({ tracker, record, packet: payload.packet }, transaction);
        }
      });
      return res.status(200).json({ ok: true, accepted: payload.records.length });
    } catch (error) {
      if (error instanceof AuthError) return res.status(401).json({ ok: false, code: 'INVALID_SIGNATURE' });
      if (error instanceof PayloadError || error instanceof SyntaxError) return res.status(400).json({ ok: false, code: 'INVALID_PAYLOAD' });
      logger.error?.('tracker_ingest_error', { error: error.message });
      return res.status(500).json({ ok: false, code: 'INTERNAL_ERROR' });
    }
  };
}

