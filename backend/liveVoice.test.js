import assert from "node:assert/strict";
import test from "node:test";
import { createLiveSetupConfig, createLiveTokenRequest } from "./liveVoice.js";

test("creates a constrained Live API token request using the REST setup field", () => {
  const now = Date.UTC(2026, 0, 1);
  const liveConfig = {
    responseModalities: ["AUDIO"],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    contextWindowCompression: {
      slidingWindow: {},
    },
    systemInstruction: {
      parts: [{ text: "Be helpful." }],
    },
  };

  const request = createLiveTokenRequest("gemini-3.8-live", liveConfig, now);
  const setupConfig = createLiveSetupConfig(liveConfig);

  assert.equal(request.uses, 1);
  assert.equal(request.expireTime, new Date(now + 30 * 60 * 1000).toISOString());
  assert.equal(request.newSessionExpireTime, new Date(now + 60 * 1000).toISOString());
  assert.deepEqual(request.bidiGenerateContentSetup, {
    model: "models/gemini-3.8-live",
    generationConfig: {
      responseModalities: ["AUDIO"],
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    contextWindowCompression: {
      slidingWindow: {},
    },
    systemInstruction: {
      parts: [{ text: "Be helpful." }],
    },
  });
  assert.equal("responseModalities" in request.bidiGenerateContentSetup, false);
  assert.equal("liveConnectConstraints" in request, false);
  assert.deepEqual(setupConfig, {
    generationConfig: {
      responseModalities: ["AUDIO"],
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    contextWindowCompression: {
      slidingWindow: {},
    },
    systemInstruction: {
      parts: [{ text: "Be helpful." }],
    },
  });
  assert.equal("responseModalities" in setupConfig, false);
});
