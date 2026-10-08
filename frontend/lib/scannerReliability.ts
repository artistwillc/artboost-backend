/**
 * ArtBoost scanner reliability helpers (v2).
 * Pure functions; safe to test without WebView, network or database access.
 * Integration into the existing scanner is intentionally a separate reviewed change.
 */
export type ScanOutcome = "completed" | "partial" | "failed";

export type ScanCheckpoint = {
  page: number;
  consecutiveEmptyOrDuplicatePages: number;
  uniqueProducts: number;
  maxPages: number;
  maxConsecutiveEmptyPages: number;
};

export function nextScanCheckpoint(
  previous: ScanCheckpoint,
  newUniqueProducts: number
): { checkpoint: ScanCheckpoint; finished: boolean; reason: string | null } {
  const added = Math.max(0, Math.floor(newUniqueProducts));
  const checkpoint: ScanCheckpoint = {
    ...previous,
    uniqueProducts: previous.uniqueProducts + added,
    consecutiveEmptyOrDuplicatePages: added === 0
      ? previous.consecutiveEmptyOrDuplicatePages + 1
      : 0,
  };
  if (checkpoint.page >= checkpoint.maxPages) {
    return { checkpoint, finished: true, reason: "page_limit" };
  }
  if (checkpoint.consecutiveEmptyOrDuplicatePages >= checkpoint.maxConsecutiveEmptyPages) {
    return { checkpoint, finished: true, reason: "consecutive_empty_pages" };
  }
  return { checkpoint: { ...checkpoint, page: checkpoint.page + 1 }, finished: false, reason: null };
}

/** A failed/partial scan must never be interpreted as proof a listing was deleted. */
export function mayReconcileMissingListings(outcome: ScanOutcome): boolean {
  return outcome === "completed";
}

/** Do not replace an existing catalog with an empty transient discovery result. */
export function retainCatalogOnFailure<T>(existing: T[], discovered: T[], outcome: ScanOutcome): T[] {
  return outcome === "failed" ? existing : discovered;
}
