import { encodeAvlFrame } from '../../src/teltonika/packet.js';

function u8(value) { const b = Buffer.alloc(1); b.writeUInt8(value); return b; }
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16BE(value); return b; }
function i16(value) { const b = Buffer.alloc(2); b.writeInt16BE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32BE(value); return b; }
function i32(value) { const b = Buffer.alloc(4); b.writeInt32BE(value); return b; }
function u64(value) { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(value)); return b; }

export const FIXTURE_TIMESTAMP = 1_787_658_000_000;

export function makeCodec8eData({ timestamp = FIXTURE_TIMESTAMP } = {}) {
  const iccid = Buffer.from('89450012345678901234', 'ascii');
  return Buffer.concat([
    u8(0x8e), u8(1),
    u64(timestamp), u8(0),
    i32(-37_038_000), i32(404_168_000), i16(650), u16(180), u8(14), u16(82),
    u16(239), u16(6),
    u16(2), u16(239), u8(1), u16(240), u8(1),
    u16(1), u16(67), u16(3700),
    u16(1), u16(16), u32(15_342_234),
    u16(1), u16(449), u64(9_007_199_254_740_993n),
    u16(1), u16(641), u16(iccid.length), iccid,
    u8(1),
  ]);
}

export function makeCodec8eFrame(options) { return encodeAvlFrame(makeCodec8eData(options)); }

