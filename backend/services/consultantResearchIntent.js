// Research intent for current questions across ArtBoost's creative disciplines.
// Pure helper: no account access, network access, or state mutations.
const CREATIVE_DOMAIN = /\b(?:art|artist|artwork|painting|drawing|illustration|photography|photographer|camera|videography|video|filmmaking|tattoo|tattooing|ceramic|pottery|sculpture|woodworking|jewelry|jewellery|craft|crafts|resin|printmaking|digital\s+art|design|social\s+media|marketing|etsy|shopify|redbubble|artpal|gumroad|instagram|pinterest|tiktok|facebook|youtube)\b/i;
const CURRENT_INFORMATION = /\b(?:latest|recent|current|currently|new\s+(?:rules|updates|features|requirements)|today|this\s+(?:week|month|year)|202[6-9]|trending|trend|trends|updated|updates|changed|changes|algorithm|platform\s+(?:rules|requirements|policies)|best\s+(?:camera|software|tools|equipment|platforms?)\s+(?:in|for)\s+202[6-9])\b/i;

export function needsCreativeWebResearch(question) {
  const text = String(question || "").slice(0, 1200);
  return CREATIVE_DOMAIN.test(text) && CURRENT_INFORMATION.test(text);
}
