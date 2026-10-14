export const AVL_IDS = Object.freeze({
  16: 'totalOdometerM', 17: 'axisX', 18: 'axisY', 19: 'axisZ', 21: 'gsmSignal',
  67: 'batteryVoltageMv', 68: 'batteryCurrentMa', 69: 'gnssStatus', 70: 'pcbTemperature',
  113: 'batteryLevelPct', 181: 'gnssPdop', 182: 'gnssHdop', 199: 'tripOdometerM',
  205: 'gsmCellId', 206: 'gsmAreaCode', 237: 'networkType', 239: 'ignition',
  240: 'movement', 241: 'gsmOperatorCode', 303: 'instantMovement',
  386: 'timeFromLastFixSeconds', 449: 'ignitionOnSeconds', 641: 'iccid',
  800: 'externalVoltageMv', 1148: 'connectivityQuality', 1433: 'deadReckoningStatus',
  1434: 'turningAlignment', 1435: 'straightAlignment',
  10800: 'eyeTemperature1C', 10801: 'eyeTemperature2C', 10802: 'eyeTemperature3C', 10803: 'eyeTemperature4C',
  10804: 'eyeHumidity1Pct', 10805: 'eyeHumidity2Pct', 10806: 'eyeHumidity3Pct', 10807: 'eyeHumidity4Pct',
  10808: 'eyeMagnet1', 10809: 'eyeMagnet2', 10810: 'eyeMagnet3', 10811: 'eyeMagnet4',
  10812: 'eyeMovement1', 10813: 'eyeMovement2', 10814: 'eyeMovement3', 10815: 'eyeMovement4',
  10816: 'eyePitch1Deg', 10817: 'eyePitch2Deg', 10818: 'eyePitch3Deg', 10819: 'eyePitch4Deg',
  10820: 'eyeLowBattery1', 10821: 'eyeLowBattery2', 10822: 'eyeLowBattery3', 10823: 'eyeLowBattery4',
  10824: 'eyeBatteryVoltage1Mv', 10825: 'eyeBatteryVoltage2Mv', 10826: 'eyeBatteryVoltage3Mv', 10827: 'eyeBatteryVoltage4Mv',
  10832: 'eyeRoll1Deg', 10833: 'eyeRoll2Deg', 10834: 'eyeRoll3Deg', 10835: 'eyeRoll4Deg',
  10836: 'eyeMovementCount1', 10837: 'eyeMovementCount2', 10838: 'eyeMovementCount3', 10839: 'eyeMovementCount4',
  11317: 'eyeSensorList',
});

const BOOLEAN_IDS = new Set([239, 240, 303]);
const EYE_BOOLEAN_IDS = new Set([
  10808, 10809, 10810, 10811,
  10812, 10813, 10814, 10815,
  10820, 10821, 10822, 10823,
]);
const EYE_SIGNED8_IDS = new Set([10816, 10817, 10818, 10819]);
const EYE_SIGNED16_IDS = new Set([10832, 10833, 10834, 10835]);
const EYE_TEMPERATURE_IDS = new Set([10800, 10801, 10802, 10803]);

function signed8(value) {
  return value > 0x7f ? value - 0x100 : value;
}

function signed16(value) {
  return value > 0x7fff ? value - 0x10000 : value;
}

function readEyeUInt16(buffer, offset, byteOrder) {
  return byteOrder === 'little' ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readEyeInt16(buffer, offset, byteOrder) {
  return byteOrder === 'little' ? buffer.readInt16LE(offset) : buffer.readInt16BE(offset);
}

function validEyeAngle(value, limit) {
  return Number.isInteger(value) && value >= -limit && value <= limit;
}

function decodeEyeAngle(value, limit, raw = value) {
  const valid = validEyeAngle(value, limit);
  return { value: valid ? value : null, raw, valid };
}

function decodeEyeSensorList(value, { byteOrder = 'big' } = {}) {
  if (!value || typeof value !== 'object' || typeof value.hex !== 'string') return null;
  if (!/^(?:[0-9a-f]{2})*$/i.test(value.hex)) return null;
  const buffer = Buffer.from(value.hex, 'hex');
  if (buffer.length < 2 || buffer[0] !== 1) return null;

  const sensors = [];
  let offset = 1;
  while (offset < buffer.length) {
    const sensorLength = buffer[offset];
    offset += 1;
    if (sensorLength === 0 || offset + sensorLength > buffer.length) return null;
    const end = offset + sensorLength;
    const sensor = { index: sensors.length, rawHex: buffer.subarray(offset, end).toString('hex') };
    const rawParameters = {};

    while (offset < end) {
      if (offset + 2 > end) return null;
      const parameterId = buffer[offset];
      const parameterLength = buffer[offset + 1];
      offset += 2;
      if (offset + parameterLength > end) return null;
      const parameter = buffer.subarray(offset, offset + parameterLength);
      offset += parameterLength;
      rawParameters[String(parameterId)] = parameter.toString('hex');

      if (parameterId === 5) sensor.deviceName = parameter.toString('ascii').replace(/\0+$/, '');
      else if (parameterId === 6 && parameterLength === 2) {
        sensor.temperatureC = readEyeInt16(parameter, 0, byteOrder) / 100;
      } else if (parameterId === 7 && parameterLength === 1) sensor.humidityPct = parameter[0];
      else if (parameterId === 8 && parameterLength === 1) sensor.magnet = parameter[0] === 1;
      else if (parameterId === 9 && parameterLength === 1) sensor.movement = parameter[0] === 1;
      else if (parameterId === 10 && parameterLength === 2) sensor.movementCount = readEyeUInt16(parameter, 0, byteOrder);
      else if (parameterId === 11 && parameterLength === 1) {
        const angle = decodeEyeAngle(signed8(parameter[0]), 90, parameter[0]);
        sensor.pitchDeg = angle.value;
        sensor.pitchRaw = angle.raw;
        sensor.pitchValid = angle.valid;
      } else if (parameterId === 12 && parameterLength === 2) {
        const angle = decodeEyeAngle(
          readEyeInt16(parameter, 0, byteOrder),
          180,
          readEyeUInt16(parameter, 0, byteOrder),
        );
        sensor.rollDeg = angle.value;
        sensor.rollRaw = angle.raw;
        sensor.rollValid = angle.valid;
      } else if (parameterId === 13 && parameterLength === 1) sensor.lowBattery = parameter[0] === 1;
      else if (parameterId === 14 && parameterLength === 2) sensor.batteryVoltageMv = readEyeUInt16(parameter, 0, byteOrder);
      else if (parameterId === 15) sensor.mac = parameter.toString('hex');
      else if (parameterId === 16 && parameterLength === 2) sensor.magnetTriggerCount = readEyeUInt16(parameter, 0, byteOrder);
    }
    sensor.rawParameters = rawParameters;
    sensors.push(sensor);
    offset = end;
  }
  return sensors;
}

export function knownIoValues(raw, options = {}) {
  const known = {};
  for (const [idText, value] of Object.entries(raw)) {
    const id = Number(idText);
    const name = AVL_IDS[id];
    if (!name) continue;
    if (BOOLEAN_IDS.has(id)) known[name] = value === 1 || value === '1';
    else if (id === 641 && value && typeof value === 'object') known.iccid = value.ascii || value.hex;
    else if (id === 11317) {
      const sensors = decodeEyeSensorList(value, options);
      if (sensors) known.eyeSensors = sensors;
    } else if (EYE_BOOLEAN_IDS.has(id)) known[name] = value === 1 || value === '1';
    else if (EYE_SIGNED8_IDS.has(id)) {
      const raw = Number(value);
      const angle = decodeEyeAngle(signed8(raw), 90, raw);
      known[name] = angle.value;
      known[`${name}Raw`] = angle.raw;
      known[`${name}Valid`] = angle.valid;
    } else if (EYE_SIGNED16_IDS.has(id)) {
      const raw = Number(value);
      const angle = decodeEyeAngle(signed16(raw), 180, raw);
      known[name] = angle.value;
      known[`${name}Raw`] = angle.raw;
      known[`${name}Valid`] = angle.valid;
    } else if (EYE_TEMPERATURE_IDS.has(id)) known[name] = signed16(Number(value)) / 100;
    else known[name] = value;
  }
  return known;
}

export { decodeEyeSensorList };
