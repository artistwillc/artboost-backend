// ARTBOOST_APPROVED_BRAND_ICONS_V3141
import React from "react";
import {
  Image,
  type ImageSourcePropType,
  View,
} from "react-native";

const ICONS: Record<string, ImageSourcePropType> = {
  artboost: require("../assets/platform-logos/artboost.webp"),
  ai: require("../assets/platform-logos/artboost-ai.webp"),

  artpal: require("../assets/platform-logos/artpal.webp"),
  shopify: require("../assets/platform-logos/shopify.webp"),
  redbubble: require("../assets/platform-logos/redbubble.webp"),
  etsy: require("../assets/platform-logos/etsy.webp"),
  gumroad: require("../assets/platform-logos/gumroad.png"),
  fineartamerica: require("../assets/platform-logos/fine-art-america.png"),
  fine_art_america: require("../assets/platform-logos/fine-art-america.png"),

  facebook: require("../assets/platform-logos/facebook.webp"),
  instagram: require("../assets/platform-logos/instagram.webp"),
  threads: require("../assets/platform-logos/threads.webp"),
  linkedin: require("../assets/platform-logos/linkedin.webp"),
  x: require("../assets/platform-logos/x.webp"),
  twitter: require("../assets/platform-logos/x.webp"),
  pinterest: require("../assets/platform-logos/pinterest.webp"),
  tiktok: require("../assets/platform-logos/tiktok.webp"),
};

function normalize(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "");
}

export function brandIconSource(value?: string | null) {
  const key = normalize(value);

  if (key.includes("fineartamerica")) return ICONS.fineartamerica;
  if (key.includes("redbubble")) return ICONS.redbubble;
  if (key.includes("shopify")) return ICONS.shopify;
  if (key.includes("gumroad")) return ICONS.gumroad;
  if (key.includes("artpal")) return ICONS.artpal;
  if (key.includes("etsy")) return ICONS.etsy;

  if (key.includes("facebook")) return ICONS.facebook;
  if (key.includes("instagram")) return ICONS.instagram;
  if (key.includes("threads")) return ICONS.threads;
  if (key === "x" || key.includes("twitter")) return ICONS.x;
  if (key.includes("linkedin")) return ICONS.linkedin;
  if (key.includes("pinterest")) return ICONS.pinterest;
  if (key.includes("tiktok")) return ICONS.tiktok;
  if (key === "ai") return ICONS.ai;

  return ICONS.artboost;
}

export default function ArtBoostBrandIcon({
  name,
  size = 42,
}: {
  name?: string | null;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={brandIconSource(name)}
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.18),
        }}
        resizeMode="contain"
      />
    </View>
  );
}
