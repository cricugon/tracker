function integer(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function boolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const renderUrl = process.env.RENDER_TRACKER_URL || 'https://budisa.onrender.com/tracker';
  const sharedSecret = process.env.TRACKER_SHARED_SECRET || '';
  const eyeSensorByteOrder = process.env.EYE_SENSOR_BYTE_ORDER || 'big';
  const allowInsecureRenderUrl = boolean('ALLOW_INSECURE_RENDER_URL');

  if (!['big', 'little'].includes(eyeSensorByteOrder)) {
    throw new Error('EYE_SENSOR_BYTE_ORDER must be big or little');
  }

  if (!sharedSecret || sharedSecret === 'CHANGE_ME') {
    throw new Error('TRACKER_SHARED_SECRET must be configured and must not be CHANGE_ME');
  }
  const parsedUrl = new URL(renderUrl);
  if (parsedUrl.protocol !== 'https:' && (nodeEnv === 'production' || !allowInsecureRenderUrl)) {
    throw new Error('RENDER_TRACKER_URL must use HTTPS (local HTTP requires ALLOW_INSECURE_RENDER_URL=true outside production)');
  }

  const allowedImeis = new Set(
    (process.env.ALLOWED_IMEIS || '').split(',').map((value) => value.trim()).filter(Boolean),
  );

  return Object.freeze({
    nodeEnv,
    tcpPort: integer('TCP_PORT', 5000, { min: 1, max: 65535 }),
    healthPort: integer('HEALTH_PORT', Number(process.env.PORT) || 3000, { min: 1, max: 65535 }),
    trackerModel: process.env.TRACKER_MODEL || 'FTC887',
    eyeSensorByteOrder,
    renderUrl,
    trackerKeyId: process.env.TRACKER_KEY_ID || 'gateway-v1',
    sharedSecret,
    allowedImeis,
    renderTimeoutMs: integer('RENDER_TIMEOUT_MS', 5000, { min: 100, max: 60000 }),
    renderMaxRetries: integer('RENDER_MAX_RETRIES', 2, { min: 0, max: 10 }),
    tcpIdleTimeoutMs: integer('TCP_IDLE_TIMEOUT_MS', 120000, { min: 1000 }),
    maxAvlDataLength: integer('MAX_AVL_DATA_LENGTH', 4096, { min: 64, max: 1048576 }),
    logLevel: process.env.LOG_LEVEL || 'info',
    logFullImei: boolean('LOG_FULL_IMEI'),
    logRawPackets: boolean('LOG_RAW_PACKETS'),
    allowInsecureRenderUrl,
  });
}
