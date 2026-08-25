const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function maskImei(imei) {
  if (!imei || imei.length < 7) return imei;
  return `${imei.slice(0, 3)}********${imei.slice(-4)}`;
}

export function createLogger({ level = 'info', fullImei = false } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  function write(logLevel, event, fields = {}) {
    if (LEVELS[logLevel] < threshold) return;
    const safe = { ...fields };
    if (safe.imei && !fullImei) safe.imei = maskImei(String(safe.imei));
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level: logLevel, event, ...safe });
    (logLevel === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
  }
  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

