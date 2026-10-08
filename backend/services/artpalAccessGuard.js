export function isArtPalHost(host) {
  return host === "artpal.com" || host.endsWith(".artpal.com");
}

export function isArtPalChallengeHtml(html) {
  const body = String(html ?? "");
  return /cf-chl-|cf-turnstile|challenge-platform/i.test(body) ||
    (/cloudflare/i.test(body) &&
      /just a moment|checking your browser|verify you are human|security verification/i.test(body));
}

export function isArtPalAccessError(error) {
  return /\b403\b|forbidden|cloudflare|security verification/i.test(
    error instanceof Error ? error.message : String(error)
  );
}

export function assertArtPalScanAccessible(accessDenied) {
  if (accessDenied) {
    throw new Error("ArtPal denied storefront access (HTTP 403 / security verification). No artwork was imported or deleted. Retry after ArtPal permits access, or use an authorized artwork export or individual product URLs.");
  }
}
