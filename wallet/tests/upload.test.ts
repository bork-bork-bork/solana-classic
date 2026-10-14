import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadBytes } from '../src/upload';
test('upload guard bounds PNG/JPG bytes and rejects active formats or false MIME', () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
  const jpg = Buffer.from([255,216,255,1]);
  assert.equal(uploadBytes('data:image/png;base64,' + png.toString('base64')), png.toString('base64'));
  assert.equal(uploadBytes('data:image/jpeg;base64,' + jpg.toString('base64')), jpg.toString('base64'));
  for (const value of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg==', 'data:image/png;base64,' + jpg.toString('base64'), 'data:image/png;base64,' + Buffer.alloc(1_048_577).toString('base64'), 'https://evil.example/image.png']) assert.throws(() => uploadBytes(value));
});
