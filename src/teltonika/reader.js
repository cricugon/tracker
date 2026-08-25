export class BufferReader {
  constructor(buffer) { this.buffer = buffer; this.offset = 0; }
  ensure(length) {
    if (length < 0 || this.offset + length > this.buffer.length) throw new RangeError('Truncated Teltonika data');
  }
  u8() { this.ensure(1); return this.buffer[this.offset++]; }
  u16() { this.ensure(2); const v = this.buffer.readUInt16BE(this.offset); this.offset += 2; return v; }
  i16() { this.ensure(2); const v = this.buffer.readInt16BE(this.offset); this.offset += 2; return v; }
  u32() { this.ensure(4); const v = this.buffer.readUInt32BE(this.offset); this.offset += 4; return v; }
  i32() { this.ensure(4); const v = this.buffer.readInt32BE(this.offset); this.offset += 4; return v; }
  u64() { this.ensure(8); const v = this.buffer.readBigUInt64BE(this.offset); this.offset += 8; return v; }
  bytes(length) { this.ensure(length); const v = this.buffer.subarray(this.offset, this.offset + length); this.offset += length; return v; }
  get remaining() { return this.buffer.length - this.offset; }
}
