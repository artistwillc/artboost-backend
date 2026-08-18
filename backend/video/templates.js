export const VIDEO_TEMPLATES = Object.freeze({
  cinematic: {
    id: "cinematic",
    name: "Cinematic Product",
    description: "Slow premium camera movement with soft cinematic fades and artwork-safe framing.",
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
    description: "Bright, restrained product presentation with crisp, minimal motion.",
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
    description: "Quicker pacing designed to hook short-form viewers while keeping the product readable.",
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
    description: "Gentle close-up motion that prioritizes design fidelity and fine artwork detail.",
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
    description: "Slow, polished pacing with darker depth and elegant fades.",
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
