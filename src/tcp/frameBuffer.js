import { MAX_IMEI_LENGTH } from '../teltonika/imei.js';

export class FrameProtocolError extends Error {}

export class TeltonikaFrameBuffer {
  constructor({ maxAvlDataLength = 4096 } = {}) {
    this.buffer = Buffer.alloc(0);
    this.maxAvlDataLength = maxAvlDataLength;
    // Allows several coalesced frames while still bounding an untrusted stream.
    this.maxBuffered = Math.max(65536, (maxAvlDataLength + 12) * 16);
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk)) throw new TypeError('TCP chunk must be a Buffer');
    if (this.buffer.length + chunk.length > this.maxBuffered) throw new FrameProtocolError('Connection buffer limit exceeded');
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
  }

  takeImei() {
    if (this.buffer.length < 2) return null;
    const length = this.buffer.readUInt16BE(0);
    if (length < 1 || length > MAX_IMEI_LENGTH) throw new FrameProtocolError('Invalid IMEI length');
    if (this.buffer.length < length + 2) return null;
    const imei = this.buffer.subarray(2, 2 + length).toString('ascii');
    this.buffer = this.buffer.subarray(2 + length);
    return imei;
  }

  takeFrame() {
    if (this.buffer.length < 8) return null;
    if (this.buffer.readUInt32BE(0) !== 0) throw new FrameProtocolError('Invalid AVL preamble');
    const dataLength = this.buffer.readUInt32BE(4);
    if (dataLength < 1 || dataLength > this.maxAvlDataLength) throw new FrameProtocolError('Invalid AVL data length');
    const totalLength = 8 + dataLength + 4;
    if (this.buffer.length < totalLength) return null;
    const frame = this.buffer.subarray(0, totalLength);
    this.buffer = this.buffer.subarray(totalLength);
    return frame;
  }
}
