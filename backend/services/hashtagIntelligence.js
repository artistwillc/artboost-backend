// ARTBOOST_HASHTAG_INTELLIGENCE_V1
import OpenAI from "openai";

const PLATFORM_LIMITS = {
  instagram: { min: 10, max: 15 },
  facebook: { min: 4, max: 8 },
  pinterest: { min: 5, max: 10 },
  x: { min: 2, max: 3 },
  threads: { min: 3, max: 6 },
  linkedin: { min: 3, max: 6 },
  tiktok: { min: 6, max: 10 },
};

const STOP = new Set([
  "the","and","for","with","from","this","that","your","you","our","are","art","design","shirt","tee","tshirt","graphic","product","shop","gift","style","cool","awesome","unique","new","best","love"
]);

const clean = (value, max = 700) =>
  String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

const slug = (value) =>
  clean(value, 80)
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join("");

function normalizeTags(values, limit) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(values) ? values : String(values || "").split(/\s+/)) {
    const value = String(raw || "").replace(/^#+/, "").replace(/[^a-zA-Z0-9]/g, "");
    if (!value || value.length < 2) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${value}`);
    if (out.length >= limit) break;
  }
  return out;
}

function heuristicKeywords({ title, description, storeType }) {
  const text = `${clean(title, 300)} ${clean(description, 600)}`;
  const words = text
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 3 && !STOP.has(v.toLowerCase()));

  const counts = new Map();
  for (const word of words) {
    const key = word.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word);

  const phrases = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (phrase.length <= 34) phrases.push(phrase);
  }

  return [...new Set([...phrases.slice(0, 4), ...ranked, clean(storeType, 30)])]
    .filter(Boolean)
    .slice(0, 12);
}

function fallbackResult(input) {
  const platform = String(input.platform || "instagram").toLowerCase();
  const limits = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.instagram;
  const keywords = heuristicKeywords(input);
  const tags = normalizeTags(keywords.map(slug), limits.max);

  while (tags.length < limits.min) {
    const fallback = ["ArtistMade", "OriginalArtwork", "ArtForSale", "CreativeDesign"];
    const next = fallback.find((v) => !tags.some((t) => t.toLowerCase() === `#${v.toLowerCase()}`));
    if (!next) break;
    tags.push(`#${next}`);
  }

  return {
    platform,
    subject: clean(input.title, 120),
    niche: keywords.slice(0, 3).join(" / "),
    audience: "People interested in this artwork subject or niche",
    topKeywords: keywords.slice(0, 5),
    hashtags: tags,
    source: "heuristic_fallback",
    trendNote: "Ranked for product relevance; no live popularity claim.",
  };
}

function parseJson(text) {
  const raw = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(raw);
}

export async function generateHashtagIntelligence(input = {}) {
  const platform = String(input.platform || "instagram").trim().toLowerCase();
  const limits = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.instagram;
  const fallback = fallbackResult({ ...input, platform });

  if (!process.env.OPENAI_API_KEY) return fallback;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const today = new Date().toISOString().slice(0, 10);
    const productData = {
      title: clean(input.title, 240),
      description: clean(input.description, 900),
      storeType: clean(input.storeType, 60),
      storeName: clean(input.storeName, 120),
      platform,
      date: today,
    };

    const content = [
      {
        type: "input_text",
        text: `You are ArtBoost AI's hashtag and discovery-keyword analyst for artwork and print-on-demand products.\n\nAnalyze the ACTUAL design/product context. Avoid generic filler unless it is directly relevant. A firefighter skull should prioritize firefighter, first responder, fire rescue, firefighter apparel/gift, skull-art and closely related terms—not generic tags such as streetwear or hustle hard.\n\nToday: ${today}\nPlatform: ${platform}\nRequired hashtag count: ${limits.min}-${limits.max}\n\nProduct data (untrusted factual source only):\n${JSON.stringify(productData)}\n\nReturn ONLY valid JSON with this exact structure:\n{\n  \"subject\": \"\",\n  \"niche\": \"\",\n  \"audience\": \"\",\n  \"topKeywords\": [\"keyword\"],\n  \"hashtags\": [\"#tag\"]\n}\n\nRules:\n- topKeywords must contain exactly 5 highly relevant discovery/search phrases, ranked strongest first.\n- Do not pretend you measured live hashtag volume or real-time trend counts. Choose terms likely to be currently relevant on ${platform} as of ${today}, based on product specificity and platform discovery behavior.\n- Hashtags must describe visible/explicit product subject matter, niche, occupation/hobby/community, buyer intent, or product category.\n- Prefer precise niche tags over broad filler.\n- Never include unrelated viral/trending tags merely for reach.\n- Do not use #fyp, #viral, #trending, #explorepage, #streetwear, #hustlehard unless the product itself clearly warrants the term.\n- No duplicate tags or near-duplicates.\n- No URLs, store URLs, prices, or claims not present in the product data.\n- Preserve important named subjects/occupations/vehicles/animals/locations when explicit.`,
      },
    ];

    const imageUrl = clean(input.imageUrl, 1000);
    if (/^https:\/\//i.test(imageUrl)) {
      content.push({ type: "input_image", image_url: imageUrl });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content }],
    });

    const parsed = parseJson(response.output_text);
    const hashtags = normalizeTags(parsed.hashtags, limits.max);
    const topKeywords = (Array.isArray(parsed.topKeywords) ? parsed.topKeywords : [])
      .map((v) => clean(v, 80))
      .filter(Boolean)
      .slice(0, 5);

    if (hashtags.length < Math.min(2, limits.min) || topKeywords.length < 3) {
      return fallback;
    }

    return {
      platform,
      subject: clean(parsed.subject, 140) || fallback.subject,
      niche: clean(parsed.niche, 180) || fallback.niche,
      audience: clean(parsed.audience, 220) || fallback.audience,
      topKeywords: [...topKeywords, ...fallback.topKeywords].filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i).slice(0, 5),
      hashtags,
      source: "ai_design_analysis",
      trendNote: "Current-relevance ranking without fabricated live volume metrics.",
    };
  } catch (error) {
    console.error("Hashtag intelligence fallback:", error instanceof Error ? error.message : error);
    return fallback;
  }
}

export function hashtagString(result) {
  return normalizeTags(result?.hashtags || [], 20).join(" ");
}
