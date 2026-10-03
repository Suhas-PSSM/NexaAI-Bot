import assert from "node:assert/strict";
import test from "node:test";
import { createLiveTokenRequest } from "./liveVoice.js";

test("creates a constrained Live API token request using the REST setup field", () => {
  const now = Date.UTC(2026, 0, 1);
  const liveConfig = {
    responseModalities: ["AUDIO"],
    sessionResumption: {},
  };

  const request = createLiveTokenRequest("gemini-3.8-live", liveConfig, now);

  assert.equal(request.uses, 1);
  assert.equal(request.expireTime, new Date(now + 30 * 60 * 1000).toISOString());
  assert.equal(request.newSessionExpireTime, new Date(now + 60 * 1000).toISOString());
  assert.deepEqual(request.bidiGenerateContentSetup, {
    model: "models/gemini-3.8-live",
    ...liveConfig,
  });
  assert.equal("liveConnectConstraints" in request, false);
});
