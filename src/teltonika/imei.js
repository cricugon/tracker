export const MIN_IMEI_LENGTH = 14;
export const MAX_IMEI_LENGTH = 17;

export function validateImei(imei) {
  return typeof imei === 'string'
    && imei.length >= MIN_IMEI_LENGTH
    && imei.length <= MAX_IMEI_LENGTH
    && /^\d+$/.test(imei);
}

export function encodeImeiHandshake(imei) {
  if (!validateImei(imei)) throw new TypeError('Invalid IMEI');
  const value = Buffer.from(imei, 'ascii');
  const result = Buffer.allocUnsafe(value.length + 2);
  result.writeUInt16BE(value.length, 0);
  value.copy(result, 2);
  return result;
}

