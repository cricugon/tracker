import { createHash } from 'node:crypto';
import { crc16Ibm } from './crc16.js';
import { parseCodec8Extended } from './codec8e.js';
import { parseCodec8 } from './codec8.js';

export class TeltonikaPacketError extends Error {
  constructor(code, message) { super(message); this.name = 'TeltonikaPacketError'; this.code = code; }
}

export function parseAvlFrame(frame, maxDataLength = 4096, options = {}) {
  if (!Buffer.isBuffer(frame) || frame.length < 13) throw new TeltonikaPacketError('invalid_packet', 'AVL frame is too short');
  if (frame.readUInt32BE(0) !== 0) throw new TeltonikaPacketError('invalid_packet', 'Invalid AVL preamble');
  const dataLength = frame.readUInt32BE(4);
  if (dataLength === 0 || dataLength > maxDataLength) throw new TeltonikaPacketError('invalid_packet', 'Invalid AVL data length');
  if (frame.length !== 8 + dataLength + 4) throw new TeltonikaPacketError('invalid_packet', 'AVL frame length mismatch');
  const data = frame.subarray(8, 8 + dataLength);
  const receivedCrc = frame.readUInt32BE(8 + dataLength);
  const calculatedCrc = crc16Ibm(data);
  if (receivedCrc !== calculatedCrc) throw new TeltonikaPacketError('invalid_crc', `CRC mismatch (received ${receivedCrc}, calculated ${calculatedCrc})`);
  let parsed;
  try {
    if (data[0] === 0x8e) parsed = parseCodec8Extended(data, options);
    else if (data[0] === 0x08) parsed = parseCodec8(data, options);
    else throw new TeltonikaPacketError('unsupported_codec', `Unsupported codec 0x${data[0].toString(16)}`);
  } catch (error) {
    if (error instanceof TeltonikaPacketError) throw error;
    throw new TeltonikaPacketError('invalid_packet', error.message);
  }
  return { ...parsed, packetId: createHash('sha256').update(frame).digest('hex') };
}

export function encodeAvlFrame(data) {
  const frame = Buffer.alloc(8 + data.length + 4);
  frame.writeUInt32BE(0, 0);
  frame.writeUInt32BE(data.length, 4);
  data.copy(frame, 8);
  frame.writeUInt32BE(crc16Ibm(data), 8 + data.length);
  return frame;
}
