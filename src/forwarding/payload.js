import { createHash } from 'node:crypto';

export function buildPayload({ imei, parsedPacket, receivedAt = new Date() }) {
  const records = parsedPacket.records.map((record, index) => ({
    ...record,
    eventId: createHash('sha256').update(`${imei}:${parsedPacket.packetId}:${index}`).digest('hex'),
    index,
  }));
  const iccid = records.map((record) => record.io.known.iccid).find(Boolean);
  return {
    schemaVersion: 1,
    source: 'teltonika-gateway',
    device: { manufacturer: 'Teltonika', model: 'FTC887', imei, ...(iccid ? { iccid } : {}) },
    packet: {
      packetId: parsedPacket.packetId,
      codec: parsedPacket.codec,
      recordCount: records.length,
      receivedAt: receivedAt.toISOString(),
    },
    records,
  };
}

