// ARTBOOST_VIDEO_V5_GENERATIVE
import OpenAI from "openai";

const STYLE = {
  cinematic: "Cinematic subject animation, believable depth, atmospheric particles, dramatic lighting, and a strong hero reveal.",
  clean_studio: "Premium commercial motion, controlled subject movement, clean depth, polished studio lighting.",
  fast_social: "High-energy subject action, dynamic environment motion, punchy camera energy, immediate visual hook.",
  artwork_focus: "Animate the central subject and important visual elements naturally; prioritize immersive subject motion and artwork fidelity.",
  luxury: "Elegant subject movement, slow dimensional depth, premium light sweeps, atmospheric detail, luxury reveal."
};

const clean = (v, n=600) => String(v || "").replace(/\s+/g," ").trim().slice(0,n);
const style = (id) => STYLE[String(id || "cinematic").toLowerCase()] || STYLE.cinematic;

function heuristic(product, templateId) {
  const title = clean(product?.title, 180);
  const desc = clean(product?.description, 350);
  const text = `${title} ${desc}`.toLowerCase();
  let motion = "Identify the main visible subject and animate it with natural, meaningful movement. Add believable secondary motion to the environment.";

  if (/fish|bass|trout|crappie|marlin|mahi|shark|dolphin|ocean|underwater|sea/.test(text))
    motion = "Animate the aquatic subject swimming naturally; add fin/body motion, water flow, bubbles, particles, and shifting underwater light.";
  else if (/astronaut|space|planet|galaxy|cosmic|star|moon/.test(text))
    motion = "Animate the astronaut or space subject with believable floating movement; add suit/fabric motion, moving stars, particles, light rays, and cosmic depth.";
  else if (/dragon|fire|flame|phoenix/.test(text))
    motion = "Animate the creature with powerful body movement; bring flames, smoke, embers, and atmospheric energy to life.";
  else if (/car|truck|camaro|mustang|dodge|ford|chevy|cobra|raptor|vehicle|hot rod/.test(text))
    motion = "Animate the vehicle with forward energy, wheel motion where visible, moving reflections, smoke or dust, and cinematic tracking.";
  else if (/wolf|tiger|lion|bear|deer|eagle|bird|horse|dog|cat|wildlife|animal/.test(text))
    motion = "Animate the animal naturally with breathing, head/body motion and subtle fur, feather, foliage, snow, mist, or dust movement.";
  else if (/abstract|psychedelic|fractal|swirl|energy|chaos/.test(text))
    motion = "Make the abstract forms flow in dimensional space; animate color, energy, particles, layered depth, and organic movement.";

  return [
    `Use the supplied artwork as the exact visual reference for "${title || "this artwork"}".`,
    motion,
    style(templateId),
    "Motion must happen INSIDE the artwork, not merely a zoom or pan.",
    "Preserve recognizable subject identity, composition, colors, logo-like marks, and important text as closely as possible.",
    "Avoid subject replacement, warped anatomy, melting, random objects, destructive morphing, or illegible text.",
    "Create a polished vertical social-media hero video with an immediate wow factor."
  ].join(" ").slice(0,1000);
}

// ARTBOOST_VIDEO_GUIDANCE_SEARCH_INTEGRITY_V1_2
function cleanUserDirection(value, max = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const ARTWORK_INTEGRITY_RULES = [
  "Treat the source artwork as locked visual truth: animate it, do not redesign it.",
  "Preserve main-subject identity, silhouette, proportions, anatomy, facial features, pose, object count, composition, crop, palette, logos, signatures, and important lettering as closely as possible.",
  "Never replace, duplicate, melt, stretch, reshape, mutate, or substantially redraw the main subject.",
  "Do not add limbs, fingers, eyes, faces, characters, products, logos, or objects not clearly present in the source.",
  "Do not rewrite, scramble, or invent visible text.",
  "Prefer low-deformation motion: subtle natural subject movement, atmosphere, particles, water, smoke, light, shadows, reflections, depth/parallax, and restrained camera motion.",
  "If user direction conflicts with artwork preservation, preserve the artwork and interpret the request through camera, lighting, atmosphere, background, or subtle motion instead."
].join(" ");

function enforceArtworkIntegrity(prompt, userPrompt = "") {
  const direction = cleanUserDirection(userPrompt);
  return [
    ARTWORK_INTEGRITY_RULES,
    direction ? ("Creative direction from the user: " + direction) : "",
    clean(prompt, 700),
    "Keep motion polished, believable, and suitable for a vertical product video."
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 1000);
}

export async function createArtworkMotionPlan({ product, templateId, userPrompt = "" }) {
  const fallback = enforceArtworkIntegrity(heuristic(product, templateId), userPrompt);
  if (!process.env.OPENAI_API_KEY) return { prompt: fallback, planner: "heuristic" };

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.ARTBOOST_MOTION_PLANNER_MODEL || "gpt-5-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: [
            "You are ArtBoost AI's artwork motion director.",
            "Study the listing artwork and write ONE image-to-video prompt.",
              "The source image is authoritative. Preserve artwork identity over dramatic motion or user direction.",
            "Make the visible subject itself come alive; do not rely on a Ken Burns zoom.",
            `Title: ${clean(product?.title,180)}`,
            `Description: ${clean(product?.description,420)}`,
            `Style: ${clean(templateId || "cinematic",80)} - ${style(templateId)}`,
            "Specify actual subject movement, environmental motion, depth, lighting, and camera behavior.",
            "Preserve identity, composition, palette, important lettering, and design identity.",
            "Avoid subject replacement, anatomy distortion, melting, random objects, destructive morphing, or illegible text.",
            "Return only the final prompt, max 850 characters."
          ].join("\n") },
          { type: "input_image", image_url: String(product?.image_url || ""), detail: "high" }
        ]
      }]
    });
    const prompt = clean(response.output_text, 950);
    if (prompt.length >= 40) return { prompt: enforceArtworkIntegrity(prompt, userPrompt), planner: "openai_vision" };
  } catch (error) {
    console.warn("ArtBoost V5 motion planner fallback:", error instanceof Error ? error.message : String(error));
  }
  return { prompt: fallback, planner: "heuristic_fallback" };
}
