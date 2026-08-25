export const AVL_IDS = Object.freeze({
  16: 'totalOdometerM', 17: 'axisX', 18: 'axisY', 19: 'axisZ', 21: 'gsmSignal',
  67: 'batteryVoltageMv', 68: 'batteryCurrentMa', 69: 'gnssStatus', 70: 'pcbTemperature',
  113: 'batteryLevelPct', 181: 'gnssPdop', 182: 'gnssHdop', 199: 'tripOdometerM',
  205: 'gsmCellId', 206: 'gsmAreaCode', 237: 'networkType', 239: 'ignition',
  240: 'movement', 241: 'gsmOperatorCode', 303: 'instantMovement',
  386: 'timeFromLastFixSeconds', 449: 'ignitionOnSeconds', 641: 'iccid',
  800: 'externalVoltageMv', 1148: 'connectivityQuality', 1433: 'deadReckoningStatus',
  1434: 'turningAlignment', 1435: 'straightAlignment',
});

const BOOLEAN_IDS = new Set([239, 240, 303]);

export function knownIoValues(raw) {
  const known = {};
  for (const [idText, value] of Object.entries(raw)) {
    const id = Number(idText);
    const name = AVL_IDS[id];
    if (!name) continue;
    if (BOOLEAN_IDS.has(id)) known[name] = value === 1 || value === '1';
    else if (id === 641 && value && typeof value === 'object') known.iccid = value.ascii || value.hex;
    else known[name] = value;
  }
  return known;
}
