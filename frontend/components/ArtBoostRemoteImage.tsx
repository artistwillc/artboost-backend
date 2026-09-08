import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import React, { useEffect, useMemo, useState } from "react";
import { ImageStyle, StyleProp, StyleSheet, View } from "react-native";

type ContentFit = "cover" | "contain" | "fill" | "none" | "scale-down";
type Props = {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  contentFit?: ContentFit;
  alt?: string | null;
  placeholderIconSize?: number;
  placeholderColor?: string;
  testID?: string;
};

function normalizeRemoteUri(value?: string | null) {
  const clean = String(value || "").trim();
  if (!clean) return null;
  if (clean.startsWith("//")) return `https:${clean}`;
  return clean;
}

function buildRemoteCandidates(value?: string | null) {
  const original = normalizeRemoteUri(value);
  if (!original) return [];
  const candidates = [original];

  try {
    const parsed = new URL(original);
    const host = parsed.hostname.toLowerCase();
    const isShopifyHosted =
      host === "cdn.shopify.com" ||
      host.endsWith(".shopifycdn.com") ||
      host.endsWith(".myshopify.com");

    if (isShopifyHosted) {
      for (const width of [700, 400]) {
        const resized = new URL(original);
        resized.searchParams.set("width", String(width));
        const candidate = resized.toString();
        if (!candidates.includes(candidate)) candidates.push(candidate);
      }
    }
  } catch {
    // Preserve the exact original URL.
  }
  return candidates;
}

export default function ArtBoostRemoteImage({
  uri,
  style,
  contentFit = "cover",
  alt,
  placeholderIconSize = 30,
  placeholderColor = "#9b94b7",
  testID,
}: Props) {
  const candidates = useMemo(() => buildRemoteCandidates(uri), [uri]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setExhausted(false);
  }, [uri]);

  const activeUri = candidates[candidateIndex] || null;

  if (!activeUri || exhausted) {
    return (
      <View style={[style, styles.placeholder]} testID={testID}>
        <Ionicons name="image-outline" size={placeholderIconSize} color={placeholderColor} />
      </View>
    );
  }

  return (
    <ExpoImage
      source={{ uri: activeUri }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      priority="normal"
      recyclingKey={`${activeUri}:${candidateIndex}`}
      alt={alt ?? undefined}
      testID={testID}
      onError={() => {
        const nextIndex = candidateIndex + 1;
        if (nextIndex < candidates.length) {
          setCandidateIndex(nextIndex);
          return;
        }
        setExhausted(true);
      }}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
});
