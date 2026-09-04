export async function readApiJson(response: Response, label = "ArtBoost request") {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`${label} returned an invalid server response (HTTP ${response.status})${preview.startsWith("<") ? ". The production API route is unavailable or misconfigured." : "."}`);
  }
}
