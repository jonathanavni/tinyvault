// Synthetic byte streams prove rejection order and terminal parsing, not transport authenticity.
import { expect, it, vi } from 'vitest';
import { FrameDecoder, encodeFrame } from './frames';
import { MAX_PAYLOAD_BYTES } from './protocol';

const valid = '{"v":1,"kind":"req","id":1,"op":"bootstrap","body":{"secret":"x"}}';
function raw(text: string | Buffer): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}
function probe() {
  const frame = vi.fn();
  const error = vi.fn();
  return { frame, error, decoder: new FrameDecoder(frame, error) };
}
it('arbitrary fragmentation and coalescing yield each canonical frame once', () => {
  const p = probe();
  const bytes = Buffer.concat([raw(valid), raw(valid)]);
  for (const byte of bytes) p.decoder.feed(Buffer.from([byte]));
  expect(p.frame).toHaveBeenCalledTimes(2);
  expect(p.error).not.toHaveBeenCalled();
  p.decoder.end();
  expect(p.decoder.stopped).toBe(true);
  const coalesced = probe();
  coalesced.decoder.feed(bytes);
  expect(coalesced.frame).toHaveBeenCalledTimes(2);
});
it.each([
  ['zero length', Buffer.alloc(4), 'frame-length'],
  ['oversized length', Buffer.from([0, 32, 0, 1]), 'frame-length'],
  ['stdout diagnostic shares oversized branch', Buffer.from('diagnostic\n'), 'frame-length'],
  ['invalid UTF-8', raw(Buffer.from([0xff])), 'frame-utf8'],
  ['invalid JSON', raw('{'), 'frame-canonical'],
  ['duplicate JSON keys', raw(valid.replace('"id":1', '"id":1,"id":1')), 'frame-canonical'],
  ['reordered keys', raw(valid.replace('"v":1,"kind":"req"', '"kind":"req","v":1')), 'frame-canonical'],
  ['id 2.0 canonical', raw(valid.replace('"id":1', '"id":2.0')), 'frame-canonical'],
  ['id zero type', raw(valid.replace('"id":1', '"id":0')), 'frame-type'],
  ['body null type', raw(valid.replace('{"secret":"x"}', 'null')), 'frame-type'],
  ['wrong version type', raw(valid.replace('"v":1', '"v":2')), 'frame-type'],
  ['unsafe id type', raw(valid.replace('"id":1', '"id":9007199254740992')), 'frame-type'],
  ['body array type', raw(valid.replace('{"secret":"x"}', '[]')), 'frame-type'],
  ['unknown op', raw(valid.replace('bootstrap', 'unknown')), 'unknown-op'],
  ['extra top field', raw(valid.replace('"v":1', '"extra":1,"v":1')), 'frame-canonical'],
  ['whitespace', raw(` ${valid}`), 'frame-canonical'],
  ['BOM', raw(Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(valid)])), 'frame-canonical'],
  ['nonboolean ok', raw('{"v":1,"kind":"res","id":1,"op":"bootstrap","ok":1,"body":{}}'), 'frame-type'],
  ['free text code', raw('{"v":1,"kind":"res","id":1,"op":"bootstrap","ok":false,"code":"text"}'), 'frame-type'],
] as const)('%s rejects first and refuses further input', (_name, bytes, code) => {
  const p = probe();
  p.decoder.feed(bytes);
  expect(p.error).toHaveBeenCalledExactlyOnceWith(code);
  expect(p.decoder.failure).toBe(code);
  p.decoder.feed(raw(valid));
  p.decoder.end();
  expect(p.frame).not.toHaveBeenCalled();
  expect(p.error).toHaveBeenCalledTimes(1);
});
it('malformed then valid in one chunk never dispatches the valid frame', () => {
  const p = probe();
  p.decoder.feed(Buffer.concat([raw('{'), raw(valid)]));
  expect(p.error).toHaveBeenCalledExactlyOnceWith('frame-canonical');
  expect(p.frame).not.toHaveBeenCalled();
});
it('session stop prevents dispatch of an already buffered valid frame', () => {
  const frame = vi.fn(() => decoder.stop());
  const decoder = new FrameDecoder(frame, vi.fn());
  decoder.feed(Buffer.concat([raw(valid), raw(valid)]));
  expect(frame).toHaveBeenCalledTimes(1);
});
it.each([Buffer.from([0]), raw(valid).subarray(0, 10)])('partial EOF reports frame-partial', (bytes) => {
  const p = probe();
  p.decoder.feed(bytes);
  p.decoder.end();
  expect(p.error).toHaveBeenCalledExactlyOnceWith('frame-partial');
});
it('encoder rebuilds top and body schema order and enforces maximum payload', () => {
  const encoded = encodeFrame({ body: { secret: 'x' }, op: 'bootstrap', id: 1, kind: 'req', v: 1 });
  expect(encoded).toEqual(raw(valid));
  expect(() => encodeFrame({ v: 1, kind: 'req', id: 1, op: 'bootstrap',
    body: { secret: 'x'.repeat(MAX_PAYLOAD_BYTES) } })).toThrow('frame-length');
  const hello = { v: 1, kind: 'req', id: 2, op: 'hello',
    body: { containerId: 'c', fixtureId: 'f', epoch: 'e', challenge: 'x' } };
  expect(encodeFrame(hello).subarray(4).toString()).toContain('"challenge":"x","epoch":"e","fixtureId":"f","containerId":"c"');
  const p = probe();
  p.decoder.feed(raw(JSON.stringify(hello)));
  expect(p.error).toHaveBeenCalledWith('frame-canonical');
});

it.each([2097151, 2097152, 2097153])('AM12 frame decoder enforces payload boundary %d', size => {
  const base = { v: 1, kind: 'res', id: 1, op: 'receipt', ok: true, body: { receipt: '' } };
  base.body.receipt = 'x'.repeat(size - Buffer.byteLength(JSON.stringify(base)));
  const bytes = raw(JSON.stringify(base)); expect(bytes.length).toBe(size + 4);
  const p = probe(); p.decoder.feed(bytes);
  if (size > 2097152) {
    expect(p.error).toHaveBeenCalledExactlyOnceWith('frame-length');
    expect(p.frame).not.toHaveBeenCalled();
  } else {
    expect(p.error).not.toHaveBeenCalled(); expect(p.frame).toHaveBeenCalledExactlyOnceWith(base);
  }
});
