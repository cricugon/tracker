import { TeltonikaFrameBuffer } from './frameBuffer.js';
import { validateImei } from '../teltonika/imei.js';
import { parseAvlFrame, TeltonikaPacketError } from '../teltonika/packet.js';
import { buildPayload } from '../forwarding/payload.js';

function writeAck(socket, count) {
  const ack = Buffer.alloc(4);
  ack.writeUInt32BE(count, 0);
  socket.write(ack);
  return ack;
}

export function handleConnection(socket, { config, logger, metrics, activeDevices, renderClient }) {
  const context = {
    state: 'WAITING_IMEI', imei: null,
    frameBuffer: new TeltonikaFrameBuffer({ maxAvlDataLength: config.maxAvlDataLength }),
    connectedAt: new Date(), lastActivityAt: new Date(), processing: false,
    drainRequested: false, closing: false, ended: false,
  };
  metrics.connectionsTotal += 1;
  metrics.activeConnections += 1;
  logger.info('device_connected', { remoteAddress: socket.remoteAddress });
  socket.setKeepAlive(true);
  socket.setTimeout(config.tcpIdleTimeoutMs);

  function closeAfterWrite() {
    socket.end();
    const timer = setTimeout(() => socket.destroy(), 1000);
    timer.unref();
  }

  function reject(event, error) {
    if (context.closing || context.ended) return;
    context.closing = true;
    metrics.packetsRejected += 1;
    if (event === 'invalid_crc') metrics.crcErrors += 1;
    logger.warn(event, { imei: context.imei, error: error?.message });
    if (!socket.destroyed) writeAck(socket, 0);
    closeAfterWrite();
  }

  function rejectHandshake(error) {
    if (context.closing || context.ended) return;
    context.closing = true;
    metrics.imeiRejected += 1;
    logger.warn('imei_rejected', { error: error?.message });
    if (!socket.destroyed) socket.write(Buffer.from([0x00]));
    closeAfterWrite();
  }

  function acceptImei(imei) {
    logger.info('imei_received', { imei });
    if (!validateImei(imei) || (config.allowedImeis.size && !config.allowedImeis.has(imei))) {
      metrics.imeiRejected += 1;
      logger.warn('imei_rejected', { imei });
      socket.write(Buffer.from([0x00]));
      closeAfterWrite();
      return false;
    }
    const previous = activeDevices.get(imei);
    if (previous && previous !== socket) {
      logger.warn('duplicate_imei_connection', { imei });
      previous.destroy();
    }
    context.imei = imei;
    context.state = 'READY_FOR_AVL';
    activeDevices.set(imei, socket);
    socket.write(Buffer.from([0x01]));
    logger.info('imei_accepted', { imei });
    return true;
  }

  async function drain() {
    if (context.processing) { context.drainRequested = true; return; }
    if (context.ended || context.closing) return;
    context.processing = true;
    context.drainRequested = false;
    try {
      if (context.state === 'WAITING_IMEI') {
        const imei = context.frameBuffer.takeImei();
        if (imei === null || !acceptImei(imei)) return;
      }
      while (!context.ended && !context.closing && !socket.destroyed) {
        const frame = context.frameBuffer.takeFrame();
        if (frame === null) break;
        metrics.packetsReceived += 1;
        logger.info('avl_packet_received', { imei: context.imei, bytes: frame.length, ...(config.logRawPackets ? { frameHex: frame.toString('hex') } : {}) });
        let parsed;
        try {
          parsed = parseAvlFrame(frame, config.maxAvlDataLength, {
            eyeSensorByteOrder: config.eyeSensorByteOrder,
          });
        }
        catch (error) {
          if (error instanceof TeltonikaPacketError) reject(error.code, error);
          else reject('invalid_packet', error);
          return;
        }
        metrics.recordsReceived += parsed.recordCount;
        const ioIds = [...new Set(
          parsed.records.flatMap((record) => Object.keys(record.io.raw).map(Number)),
        )].sort((a, b) => a - b);
        logger.info('avl_packet_parsed', {
          imei: context.imei,
          codec: parsed.codec,
          records: parsed.recordCount,
          packetId: parsed.packetId,
          ioIds,
        });
        const payload = buildPayload({
          imei: context.imei,
          parsedPacket: parsed,
          model: config.trackerModel,
        });
        logger.info('render_forward_started', { imei: context.imei, packetId: parsed.packetId, records: parsed.recordCount });
        try {
          await renderClient.forward(payload);
          metrics.packetsForwarded += 1;
          metrics.recordsForwarded += parsed.recordCount;
          metrics.lastRenderSuccessAt = new Date().toISOString();
          logger.info('render_forward_success', { imei: context.imei, packetId: parsed.packetId, records: parsed.recordCount });
          const ack = writeAck(socket, parsed.recordCount);
          logger.info('teltonika_ack', { imei: context.imei, accepted: parsed.recordCount, ackHex: ack.toString('hex') });
        } catch (error) {
          metrics.renderErrors += 1;
          reject('render_forward_failed', error);
          return;
        }
      }
    } catch (error) {
      if (context.state === 'WAITING_IMEI') rejectHandshake(error);
      else reject('invalid_packet', error);
    } finally {
      context.processing = false;
      if (context.drainRequested && !context.ended && !context.closing) queueMicrotask(drain);
    }
  }

  socket.on('data', (chunk) => {
    context.lastActivityAt = new Date();
    if (context.closing || context.ended) return;
    try { context.frameBuffer.push(chunk); drain(); }
    catch (error) {
      if (context.state === 'WAITING_IMEI') rejectHandshake(error);
      else reject('invalid_packet', error);
    }
  });
  socket.on('timeout', () => {
    logger.warn('socket_timeout', { imei: context.imei });
    socket.destroy();
  });
  socket.on('error', (error) => logger.warn('socket_error', { imei: context.imei, error: error.message }));
  socket.on('close', () => {
    if (context.ended) return;
    context.ended = true;
    metrics.activeConnections -= 1;
    if (context.imei && activeDevices.get(context.imei) === socket) activeDevices.delete(context.imei);
    logger.info('device_disconnected', { imei: context.imei, connectedAt: context.connectedAt.toISOString() });
  });
  return context;
}
