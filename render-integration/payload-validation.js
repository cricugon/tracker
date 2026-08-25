export class PayloadError extends Error {}

export function validateTrackerPayload(payload) {
  if (!payload || payload.schemaVersion !== 1 || payload.source !== 'teltonika-gateway') throw new PayloadError('Invalid schema or source');
  if (!/^\d{14,17}$/.test(payload.device?.imei || '')) throw new PayloadError('Invalid device IMEI');
  if (!Array.isArray(payload.records) || payload.packet?.recordCount !== payload.records.length || payload.records.length < 1) {
    throw new PayloadError('Record count mismatch');
  }
  const eventIds = new Set();
  for (const record of payload.records) {
    if (!/^[0-9a-f]{64}$/i.test(record?.eventId || '') || eventIds.has(record.eventId)) throw new PayloadError('Invalid or repeated eventId');
    eventIds.add(record.eventId);
    if (!Number.isSafeInteger(record.timestampMs) || typeof record.timestamp !== 'string') throw new PayloadError('Invalid record timestamp');
    const gps = record.gps;
    if (!gps || !Number.isFinite(gps.latitude) || gps.latitude < -90 || gps.latitude > 90
      || !Number.isFinite(gps.longitude) || gps.longitude < -180 || gps.longitude > 180
      || !Number.isInteger(gps.satellites) || gps.satellites < 0 || gps.satellites > 255
      || !Number.isInteger(gps.speedKph) || gps.speedKph < 0 || gps.speedKph > 65535
      || !Number.isInteger(gps.angleDeg) || gps.angleDeg < 0 || gps.angleDeg > 360) {
      throw new PayloadError('Invalid GPS data');
    }
  }
  return payload;
}
