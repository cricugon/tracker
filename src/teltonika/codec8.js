import { parseCodecData } from './codecCommon.js';

export function parseCodec8(data) {
  return { codec: '8', ...parseCodecData(data, { codecId: 0x08, extended: false }) };
}

