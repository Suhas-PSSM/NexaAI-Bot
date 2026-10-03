export const createLiveTokenRequest = (model, liveConfig, now = Date.now()) => ({
  uses: 1,
  expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
  newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
  bidiGenerateContentSetup: {
    model: `models/${model}`,
    ...liveConfig,
  },
});
