import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodec8Extended } from '../src/teltonika/codec8e.js';
import { knownIoValues } from '../src/teltonika/avlIds.js';
import { makeCodec8eData, FIXTURE_TIMESTAMP } from './helpers/fixture.js';

test('decodes Codec 8 Extended GPS, time and every IO width', () => {
  const packet = parseCodec8Extended(makeCodec8eData());
  assert.equal(packet.codec, '8E');
  assert.equal(packet.recordCount, 1);
  const record = packet.records[0];
  assert.equal(record.timestampMs, FIXTURE_TIMESTAMP);
  assert.equal(record.timestamp, new Date(FIXTURE_TIMESTAMP).toISOString());
  assert.deepEqual(record.gps, {
    longitude: -3.7038, latitude: 40.4168, altitudeM: 650,
    angleDeg: 180, satellites: 14, speedKph: 82, valid: true,
  });
  assert.equal(record.io.eventId, 239);
  assert.equal(record.io.raw['239'], 1);
  assert.equal(record.io.raw['67'], 3700);
  assert.equal(record.io.raw['16'], 15342234);
  assert.equal(record.io.raw['449'], '9007199254740993');
  assert.deepEqual(record.io.raw['641'], { hex: '3839343530303132333435363738393031323334', ascii: '89450012345678901234' });
  assert.equal(record.io.known.ignition, true);
  assert.equal(record.io.known.iccid, '89450012345678901234');
});

test('rejects mismatching record counts and truncation', () => {
  const data = makeCodec8eData();
  data[data.length - 1] = 2;
  assert.throws(() => parseCodec8Extended(data), /Number of Data/);
  assert.throws(() => parseCodec8Extended(data.subarray(0, 20)), /Truncated/);
});

test('normalizes EYE fixed pitch and roll without changing raw values', () => {
  const known = knownIoValues({ '10816': 244, '10832': 65511, '10833': 250 });
  assert.equal(known.eyePitch1Deg, -12);
  assert.equal(known.eyePitch1DegRaw, 244);
  assert.equal(known.eyePitch1DegValid, true);
  assert.equal(known.eyeRoll1Deg, -25);
  assert.equal(known.eyeRoll1DegRaw, 65511);
  assert.equal(known.eyeRoll1DegValid, true);
  assert.equal(known.eyeRoll2Deg, null);
  assert.equal(known.eyeRoll2DegRaw, 250);
  assert.equal(known.eyeRoll2DegValid, false);
});

test('decodes EYE AVL 11317 pitch and roll in both supported byte orders', () => {
  const bigEndian = knownIoValues({ '11317': { hex: '01070b01f40c02ffe7' } });
  assert.equal(bigEndian.eyeSensors.length, 1);
  assert.equal(bigEndian.eyeSensors[0].pitchDeg, -12);
  assert.equal(bigEndian.eyeSensors[0].rollDeg, -25);
  assert.equal(bigEndian.eyeSensors[0].pitchRaw, 244);
  assert.equal(bigEndian.eyeSensors[0].rollRaw, 65511);

  const littleEndian = knownIoValues(
    { '11317': { hex: '01070b01f40c02e7ff' } },
    { byteOrder: 'little' },
  );
  assert.equal(littleEndian.eyeSensors[0].pitchDeg, -12);
  assert.equal(littleEndian.eyeSensors[0].rollDeg, -25);
});
