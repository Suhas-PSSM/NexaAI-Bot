import assert from 'node:assert/strict';
import test from 'node:test';
import { pcm16Base64FromFloat32 } from './voiceAudio.js';

const decodePcm16 = base64 => {
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 2 }, (_value, index) => view.getInt16(index * 2, true));
};

test('encodes float audio to little-endian 16 kHz PCM', () => {
  const pcm = decodePcm16(pcm16Base64FromFloat32(new Float32Array([-1, -0.5, 0, 0.5, 1]), 16000));

  assert.deepEqual(pcm, [-32768, -16384, 0, 16383, 32767]);
});

test('resamples higher-rate microphone frames to 16 kHz', () => {
  const pcm = decodePcm16(pcm16Base64FromFloat32(new Float32Array([-0.5, -0.5, 0, 0, 0.5, 0.5]), 48000));

  assert.deepEqual(pcm, [-10922, 10922]);
});

test('returns no audio for an invalid input sample rate', () => {
  assert.equal(pcm16Base64FromFloat32(new Float32Array([0.5]), 0), '');
});
