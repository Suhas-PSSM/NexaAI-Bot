const INPUT_SAMPLE_RATE = 16000;

export const pcm16Base64FromFloat32 = (samples, sourceSampleRate) => {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) return '';

  const step = sourceSampleRate / INPUT_SAMPLE_RATE;
  const outputLength = Math.floor(samples.length / step);
  const bytes = new Uint8Array(outputLength * 2);
  const view = new DataView(bytes.buffer);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * step);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * step));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex];
    }
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    view.setInt16(outputIndex * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};
