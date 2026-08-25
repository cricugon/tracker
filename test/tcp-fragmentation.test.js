import test from 'node:test';
import assert from 'node:assert/strict';
import { TeltonikaFrameBuffer } from '../src/tcp/frameBuffer.js';
import { makeCodec8eFrame } from './helpers/fixture.js';

function extractWithChunks(chunks) {
  const parser = new TeltonikaFrameBuffer();
  const frames = [];
  for (const chunk of chunks) {
    parser.push(chunk);
    for (;;) {
      const frame = parser.takeFrame();
      if (!frame) break;
      frames.push(frame.toString('hex'));
    }
  }
  return frames;
}

function pieces(buffer, count) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(buffer.length * index / count);
    const end = Math.floor(buffer.length * (index + 1) / count);
    if (end > start) result.push(buffer.subarray(start, end));
  }
  return result;
}

test('same frame result whole, bytewise, split in 2 and split in 10', () => {
  const frame = makeCodec8eFrame();
  const expected = [frame.toString('hex')];
  assert.deepEqual(extractWithChunks([frame]), expected);
  assert.deepEqual(extractWithChunks([...frame].map((_, i) => frame.subarray(i, i + 1))), expected);
  assert.deepEqual(extractWithChunks(pieces(frame, 2)), expected);
  assert.deepEqual(extractWithChunks(pieces(frame, 10)), expected);
});

test('extracts two coalesced packets without duplication', () => {
  const first = makeCodec8eFrame();
  const second = makeCodec8eFrame({ timestamp: FIXED_SECOND });
  assert.deepEqual(extractWithChunks([Buffer.concat([first, second])]), [first.toString('hex'), second.toString('hex')]);
});

const FIXED_SECOND = 1_787_658_001_000;

