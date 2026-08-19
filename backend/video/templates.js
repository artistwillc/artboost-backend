export const VIDEO_TEMPLATES = Object.freeze({
  cinematic: {
    id: "cinematic",
    name: "Cinematic Product",
    description: "Cinematic multi-beat camera movement, dramatic depth, atmospheric glow, and premium artwork-safe reveals.",
    clipSeconds: 4.2,
    transitionSeconds: 0.65,
    transition: "fade",
    zoomStep: 0.00055,
    maxZoom: 1.075,
    backgroundBlur: 28,
    backgroundBrightness: -0.12,
    foregroundWidth: 940,
  },
  clean_studio: {
    id: "clean_studio",
    name: "Clean Studio",
    description: "Bright commercial presentation with precise studio motion, clean depth, and polished product-focused reveals.",
    clipSeconds: 3.8,
    transitionSeconds: 0.45,
    transition: "smoothleft",
    zoomStep: 0.00038,
    maxZoom: 1.05,
    backgroundBlur: 34,
    backgroundBrightness: -0.04,
    foregroundWidth: 960,
  },
  fast_social: {
    id: "fast_social",
    name: "Fast Social Ad",
    description: "Punchy short-form pacing with energetic camera pulses, faster visual hooks, and product-safe social ad motion.",
    clipSeconds: 2.9,
    transitionSeconds: 0.35,
    transition: "slideleft",
    zoomStep: 0.0007,
    maxZoom: 1.08,
    backgroundBlur: 24,
    backgroundBrightness: -0.10,
    foregroundWidth: 970,
  },
  artwork_focus: {
    id: "artwork_focus",
    name: "Artwork Focus",
    description: "Immersive detail-first movement with deeper push-ins, atmospheric framing, and artwork-preserving cinematic focus.",
    clipSeconds: 4.4,
    transitionSeconds: 0.6,
    transition: "fade",
    zoomStep: 0.00045,
    maxZoom: 1.065,
    backgroundBlur: 32,
    backgroundBrightness: -0.15,
    foregroundWidth: 980,
  },
  luxury: {
    id: "luxury",
    name: "Luxury Showcase",
    description: "Elegant premium pacing with dramatic depth, refined camera sweeps, richer contrast, and luxury-style reveals.",
    clipSeconds: 4.7,
    transitionSeconds: 0.8,
    transition: "smoothup",
    zoomStep: 0.00032,
    maxZoom: 1.045,
    backgroundBlur: 38,
    backgroundBrightness: -0.22,
    foregroundWidth: 920,
  },
});

export const DEFAULT_VIDEO_TEMPLATE = "cinematic";

export function getVideoTemplate(id) {
  return VIDEO_TEMPLATES[id] || VIDEO_TEMPLATES[DEFAULT_VIDEO_TEMPLATE];
}

export function listVideoTemplates() {
  return Object.values(VIDEO_TEMPLATES);
}
