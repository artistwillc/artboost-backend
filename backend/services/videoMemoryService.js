// ARTBOOST_VIDEO_MEMORY_RESTART_HARDENING_V1
function mb(value) {
  return Math.round((Number(value) || 0) / 1024 / 1024 * 10) / 10;
}

export function videoMemorySnapshot(stage, context = {}) {
  const usage = process.memoryUsage();
  const snapshot = {
    stage,
    rssMB: mb(usage.rss),
    heapUsedMB: mb(usage.heapUsed),
    heapTotalMB: mb(usage.heapTotal),
    externalMB: mb(usage.external),
    arrayBuffersMB: mb(usage.arrayBuffers),
    pid: process.pid,
    ...context,
  };
  console.log("ArtBoost Video memory:", snapshot);
  return snapshot;
}
