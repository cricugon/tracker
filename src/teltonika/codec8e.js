import { parseCodecData } from './codecCommon.js';

export function parseCodec8Extended(data, options = {}) {
  return { codec: '8E', ...parseCodecData(data, { codecId: 0x8e, extended: true, ...options }) };
}
