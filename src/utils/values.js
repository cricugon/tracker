export function bigintToJson(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString(10);
}

export function safeTimestamp(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('AVL timestamp exceeds Number.MAX_SAFE_INTEGER');
  const timestampMs = Number(value);
  const date = new Date(timestampMs);
  if (!Number.isFinite(timestampMs) || Number.isNaN(date.getTime())) throw new RangeError('Invalid AVL timestamp');
  return { timestampMs, timestamp: date.toISOString() };
}

