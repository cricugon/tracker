import { BufferReader } from './reader.js';
import { knownIoValues } from './avlIds.js';
import { bigintToJson, safeTimestamp } from '../utils/values.js';

function readFixedValue(reader, width) {
  if (width === 1) return reader.u8();
  if (width === 2) return reader.u16();
  if (width === 4) return reader.u32();
  if (width === 8) return bigintToJson(reader.u64());
  throw new RangeError(`Unsupported IO width ${width}`);
}

function readGps(reader) {
  const longitude = reader.i32() / 10_000_000;
  const latitude = reader.i32() / 10_000_000;
  const altitudeM = reader.i16();
  const angleDeg = reader.u16();
  const satellites = reader.u8();
  const speedKph = reader.u16();
  const inRange = latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  return {
    latitude, longitude, altitudeM, angleDeg, satellites, speedKph,
    valid: inRange && satellites > 0 && !(latitude === 0 && longitude === 0),
  };
}

function parseIo(reader, extended) {
  const readId = extended ? () => reader.u16() : () => reader.u8();
  const readCount = extended ? () => reader.u16() : () => reader.u8();
  const eventId = readId();
  const declaredTotal = readCount();
  const raw = {};
  let actualTotal = 0;

  for (const width of [1, 2, 4, 8]) {
    const count = readCount();
    actualTotal += count;
    for (let index = 0; index < count; index += 1) raw[String(readId())] = readFixedValue(reader, width);
  }

  if (extended) {
    const count = readCount();
    actualTotal += count;
    for (let index = 0; index < count; index += 1) {
      const id = readId();
      const value = reader.bytes(reader.u16());
      const ascii = value.toString('ascii');
      raw[String(id)] = {
        hex: value.toString('hex'),
        ...(id === 641 && /^[\x20-\x7e]+$/.test(ascii) ? { ascii } : {}),
      };
    }
  }

  if (actualTotal !== declaredTotal) {
    throw new RangeError(`IO count mismatch: declared ${declaredTotal}, parsed ${actualTotal}`);
  }
  return { eventId, raw, known: knownIoValues(raw) };
}

export function parseCodecData(data, { codecId, extended }) {
  const reader = new BufferReader(data);
  if (reader.u8() !== codecId) throw new RangeError(`Expected codec 0x${codecId.toString(16)}`);
  const recordCount = reader.u8();
  if (recordCount === 0) throw new RangeError('AVL packet has no records');
  const records = [];
  for (let index = 0; index < recordCount; index += 1) {
    const time = safeTimestamp(reader.u64());
    records.push({
      index,
      ...time,
      priority: reader.u8(),
      gps: readGps(reader),
      io: parseIo(reader, extended),
    });
  }
  const trailingCount = reader.u8();
  if (trailingCount !== recordCount) throw new RangeError('Number of Data 1 does not equal Number of Data 2');
  if (reader.remaining !== 0) throw new RangeError('Unexpected bytes after AVL records');
  return { recordCount, records };
}

