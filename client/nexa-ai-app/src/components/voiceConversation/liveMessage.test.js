import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLiveServerMessage } from './liveMessage.js';

const message = { setupComplete: {} };
const json = JSON.stringify(message);

test('parses text Live API messages', async () => {
  assert.deepEqual(await parseLiveServerMessage(json), message);
});

test('parses Blob Live API messages', async () => {
  assert.deepEqual(await parseLiveServerMessage(new Blob([json])), message);
});

test('parses ArrayBuffer Live API messages', async () => {
  const buffer = new TextEncoder().encode(json).buffer;
  assert.deepEqual(await parseLiveServerMessage(buffer), message);
});

test('rejects malformed or non-object Live API messages', async () => {
  await assert.rejects(parseLiveServerMessage('{'), SyntaxError);
  await assert.rejects(parseLiveServerMessage('null'), TypeError);
});
