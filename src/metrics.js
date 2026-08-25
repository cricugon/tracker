export function createMetrics() {
  return {
    connectionsTotal: 0,
    activeConnections: 0,
    imeiRejected: 0,
    packetsReceived: 0,
    recordsReceived: 0,
    packetsForwarded: 0,
    recordsForwarded: 0,
    packetsRejected: 0,
    renderErrors: 0,
    crcErrors: 0,
    lastRenderSuccessAt: null,
  };
}

